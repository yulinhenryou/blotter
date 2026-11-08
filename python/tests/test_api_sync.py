"""POST /api/v1/sync and the read endpoints, on SQLite and PostgreSQL (ADR-0026).

M3a acceptance criterion 3: the same batch synced twice creates no duplicates and the second
response reports every item as unchanged; conflicts are reported per item; validation errors come
back with the field paths of the checker; a batch with an invalid hand still applies its valid
items.
"""

import json
import random
import uuid
from collections.abc import Iterator
from typing import Any

import pytest
from dealer import deal
from fastapi.testclient import TestClient
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from sqlalchemy import Engine, delete, func, select
from sqlalchemy.orm import Session as OrmSession

from review.api.app import create_app
from review.domain import HandRecord, check
from review.domain.record import RecordReason as R
from review.ledger import decision_points
from review.storage import migrate
from review.storage.db import make_engine
from review.storage.models import (
    DecisionPointRow,
    Hand,
    HandAction,
    HandSeat,
    Player,
    Session,
    Venue,
)

Json = dict[str, Any]
shared_db = settings(suppress_health_check=[HealthCheck.function_scoped_fixture])


@pytest.fixture
def engine(database_url: str) -> Iterator[Engine]:
    migrate.upgrade(database_url)
    engine = make_engine(database_url)
    yield engine
    engine.dispose()


@pytest.fixture
def client(engine: Engine) -> TestClient:
    return TestClient(create_app(engine))


def _clear(engine: Engine) -> None:
    with OrmSession(engine) as db, db.begin():
        for model in (DecisionPointRow, HandAction, HandSeat, Hand, Session, Player, Venue):
            db.execute(delete(model))


def _count(engine: Engine, model: type[Any]) -> int:
    with OrmSession(engine) as db:
        return db.scalar(select(func.count()).select_from(model)) or 0


def _batch(hands: list[HandRecord]) -> Json:
    """A batch carrying the hands and every session and player they refer to."""
    venue = {"id": str(_uuid7(1)), "name": "Casino", "kind": "live", "timezone": "Europe/Vienna"}
    sessions = {
        str(h.session_id): {
            "id": str(h.session_id),
            "venue_id": venue["id"],
            "started_at": "2026-11-07T20:00:00+01:00",
            "small_blind_chips": h.stakes.small_blind_chips,
            "big_blind_chips": h.stakes.big_blind_chips,
            "currency": "EUR",
        }
        for h in hands
    }
    players = {
        str(e.player_id): {"id": str(e.player_id), "display_name": f"p{i}"}
        for h in hands
        for i, e in enumerate(h.seats)
        if e.player_id is not None
    }
    return {
        "venues": [venue],
        "players": list(players.values()),
        "sessions": list(sessions.values()),
        "hands": [json.loads(h.model_dump_json()) for h in hands],
    }


def _uuid7(n: int) -> uuid.UUID:
    return uuid.UUID(f"019a5f00-0000-7000-8000-{n:012x}")


def _outcomes(response: Json) -> list[tuple[str, int, str]]:
    return [(i["kind"], i["index"], i["outcome"]) for i in response["items"]]


def _sync(client: TestClient, batch: Json) -> Json:
    response = client.post("/api/v1/sync", json=batch)
    assert response.status_code == 200, response.text
    body: Json = response.json()
    return body


def _dealt(seed: int) -> HandRecord:
    return deal(random.Random(seed))[0]


# --- AC3 ---------------------------------------------------------------------------------------

hand_lists = st.lists(st.randoms(use_true_random=False).map(lambda r: deal(r)[0]), max_size=4)


@shared_db
@given(hand_lists)
def test_the_same_batch_twice_creates_no_duplicates(
    engine: Engine, client: TestClient, hands: list[HandRecord]
) -> None:
    _clear(engine)
    hands = list({h.id: h for h in hands}.values())  # one entry per hand id
    batch = _batch(hands)
    first = _sync(client, batch)
    assert {i["outcome"] for i in first["items"]} == {"created"}
    counts = {m: _count(engine, m) for m in (Venue, Player, Session, Hand, HandAction)}
    second = _sync(client, batch)
    assert [(k, i) for k, i, _ in _outcomes(second)] == [(k, i) for k, i, _ in _outcomes(first)]
    assert {i["outcome"] for i in second["items"]} == {"unchanged"}
    assert {m: _count(engine, m) for m in counts} == counts
    # What is stored is the canonical record, with its decision points.
    for h in hands:
        canonical = check(h).record
        assert canonical is not None
        detail = client.get(f"/api/v1/hands/{h.id}").json()
        assert HandRecord.model_validate(detail["hand"]) == canonical
        expected = [p.action_seq for p in decision_points(canonical)]
        assert [p["action_seq"] for p in detail["decision_points"]] == expected
        assert all(not p["scorable"] for p in detail["decision_points"])


def test_conflicts_are_reported_per_item(client: TestClient) -> None:
    a, b = _dealt(1), _dealt(2)
    _sync(client, _batch([a, b]))
    # a: same revision, other content -> conflict; b: unchanged; c: new -> created.
    changed = a.model_copy(
        update={"record_reason": R.ROUTINE if a.record_reason is not R.ROUTINE else R.NOTABLE}
    )
    c = _dealt(3)
    response = _sync(client, _batch([changed, b, c]))
    hands = [
        (i["index"], i["outcome"], i["stored_revision"])
        for i in response["items"]
        if i["kind"] == "hand"
    ]
    assert hands == [(0, "conflict", 1), (1, "unchanged", 1), (2, "created", 1)]
    stored = client.get(f"/api/v1/hands/{a.id}").json()["hand"]
    assert stored["record_reason"] == a.record_reason  # the conflict changed nothing


def test_a_higher_revision_replaces_and_a_lower_one_conflicts(client: TestClient) -> None:
    a = _dealt(1)
    _sync(client, _batch([a]))
    newer = a.model_copy(update={"revision": 3, "record_reason": R.RANDOM_SAMPLE})
    response = _sync(client, _batch([newer]))
    assert next(i for i in response["items"] if i["kind"] == "hand")["outcome"] == "replaced"
    older = a.model_copy(update={"revision": 2})
    response = _sync(client, _batch([older]))
    result = next(i for i in response["items"] if i["kind"] == "hand")
    assert (result["outcome"], result["stored_revision"]) == ("conflict", 3)
    assert client.get(f"/api/v1/hands/{a.id}").json()["hand"]["record_reason"] == "random_sample"


def test_invalid_hands_report_field_paths_and_valid_items_still_apply(client: TestClient) -> None:
    good, rule_broken, malformed = _dealt(1), _dealt(2), _dealt(3)
    batch = _batch([good, rule_broken, malformed])
    # The checker's kind of error: more chips won than there are in the pots.
    batch["hands"][1]["results"][0]["won_chips"] += 10**6
    # The model's kind of error: a card that is not a card.
    batch["hands"][2]["seats"][0]["hole_cards"] = ["Zz", "As"]
    response = _sync(client, batch)
    hands = {i["index"]: i for i in response["items"] if i["kind"] == "hand"}
    assert hands[0]["outcome"] == "created"
    assert hands[1]["outcome"] == "invalid"
    assert [x["path"] for x in hands[1]["issues"]] == [["results", 0, "won_chips"]]
    assert hands[1]["issues"][0]["code"] in ("results_exceed_pot", "results_infeasible")
    assert hands[2]["outcome"] == "invalid"
    assert hands[2]["id"] == str(malformed.id)
    assert [(x["path"], x["code"]) for x in hands[2]["issues"]] == [
        (["seats", 0, "hole_cards", 0], "string_pattern_mismatch")
    ]
    assert client.get(f"/api/v1/hands/{good.id}").status_code == 200
    assert client.get(f"/api/v1/hands/{rule_broken.id}").status_code == 404
    assert client.get(f"/api/v1/hands/{malformed.id}").status_code == 404


def test_a_raise_below_the_minimum_comes_back_with_its_field_path(client: TestClient) -> None:
    # A fixed hand: 1/2, three seats; seat 1 (button, hero) raises to 3, below the minimum of 4.
    hand = {
        "id": str(_uuid7(10)),
        "session_id": str(_uuid7(11)),
        "client_seq": 0,
        "record_reason": "notable",
        "stakes": {"small_blind_chips": 1, "big_blind_chips": 2},
        "table_size": 3,
        "dealt_in_seats": [1, 2, 3],
        "button_seat": 1,
        "hero_seat": 1,
        "seats": [{"seat": 1, "starting_stack_chips": 100, "hole_cards": ["As", "Kd"]}],
        "actions": [{"street": "preflop", "seat": 1, "kind": "raise", "amount_to_chips": 3}],
        "results": [{"seat": 1, "won_chips": 3}],
    }
    session = {
        "id": hand["session_id"],
        "started_at": "2026-11-07T19:00:00Z",
        "small_blind_chips": 1,
        "big_blind_chips": 2,
    }
    response = _sync(client, {"sessions": [session], "hands": [hand]})
    result = response["items"][1]
    assert result["outcome"] == "invalid"
    assert [(x["path"], x["code"]) for x in result["issues"]] == [
        (["actions", 0, "amount_to_chips"], "below_min_raise")
    ]


def test_references_must_exist(engine: Engine, client: TestClient) -> None:
    a = _dealt(1)
    batch = _batch([a])
    batch["sessions"][0]["venue_id"] = str(_uuid7(99))  # not in the batch, not stored
    response = _sync(client, batch)
    by_kind = {i["kind"]: i for i in response["items"]}
    assert by_kind["session"]["issues"][0]["code"] == "unknown_venue"
    assert by_kind["hand"]["issues"][0]["code"] == "unknown_session"
    assert _count(engine, Hand) == 0


def test_a_second_hand_with_the_same_client_seq_is_refused(client: TestClient) -> None:
    a = _dealt(1)
    twin = _dealt(2).model_copy(update={"session_id": a.session_id, "client_seq": a.client_seq})
    response = _sync(client, _batch([a, twin]))
    hands = [i for i in response["items"] if i["kind"] == "hand"]
    assert hands[0]["outcome"] == "created"
    assert [(x["path"], x["code"]) for x in hands[1]["issues"]] == [
        (["client_seq"], "duplicate_client_seq")
    ]


def test_a_malformed_batch_is_rejected_whole(client: TestClient) -> None:
    assert client.post("/api/v1/sync", json={"hands": "not a list"}).status_code == 422
    assert client.post("/api/v1/sync", json={"tables": []}).status_code == 422
    assert client.post("/api/v1/sync", json=[]).status_code == 422


def test_invalid_entities_report_field_paths(client: TestClient) -> None:
    batch = {
        "venues": [{"id": str(_uuid7(1)), "name": "X", "kind": "live", "timezone": "Mars/Base"}],
        "sessions": [
            {
                "id": str(_uuid7(2)),
                "started_at": "2026-11-07T20:00:00Z",
                "ended_at": "2026-11-07T19:00:00Z",
                "small_blind_chips": 2,
                "big_blind_chips": 1,
            }
        ],
    }
    response = _sync(client, batch)
    issues = {i["kind"]: [(x["path"], x["code"]) for x in i["issues"]] for i in response["items"]}
    assert issues == {
        "venue": [(["timezone"], "value_error")],
        "session": [(["ended_at"], "value_error"), (["big_blind_chips"], "value_error")],
    }


# --- Reads -------------------------------------------------------------------------------------


def test_reads(client: TestClient) -> None:
    a = _dealt(1)
    later = a.model_copy(update={"id": _uuid7(20), "client_seq": a.client_seq + 1})
    batch = _batch([later, a])
    batch["sessions"].append(
        {
            "id": str(_uuid7(30)),
            "started_at": "2026-11-06T20:00:00Z",
            "small_blind_chips": 1,
            "big_blind_chips": 2,
        }
    )
    _sync(client, batch)
    sessions = client.get("/api/v1/sessions").json()
    assert [s["id"] for s in sessions] == [str(a.session_id), str(_uuid7(30))]  # newest first
    assert sessions[0]["started_at"] == "2026-11-07T19:00:00Z"  # stored in UTC
    hands = client.get(f"/api/v1/sessions/{a.session_id}/hands").json()
    assert [h["id"] for h in hands] == [str(a.id), str(later.id)]  # by client_seq
    assert client.get(f"/api/v1/sessions/{_uuid7(30)}/hands").json() == []
    assert client.get(f"/api/v1/sessions/{_uuid7(31)}").status_code == 404
    assert client.get(f"/api/v1/sessions/{_uuid7(31)}/hands").status_code == 404
    assert client.get(f"/api/v1/hands/{_uuid7(31)}").status_code == 404
