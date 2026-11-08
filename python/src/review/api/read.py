"""Read endpoints: sessions, their hands, and a hand with its decision points (GET only)."""

import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from review.api.deps import DbDep
from review.domain import HandRecord
from review.domain.entities import SessionRecord
from review.ledger import Situation
from review.storage.repository import (
    list_hands,
    list_sessions,
    load_hand,
    load_session,
    load_stored_decision_points,
)

router = APIRouter()


class DecisionPointOut(BaseModel):
    """One hero decision: the index of its action in ``hand.actions`` and its situation key.

    Every decision is unscored until the evaluator exists (M3b); ``unscored_reason`` says why.
    """

    action_seq: int
    classifier_version: int
    situation: Situation
    scorable: bool
    unscored_reason: str | None


class HandDetail(BaseModel):
    """A stored hand (its canonical record) with its decision points."""

    hand: HandRecord
    decision_points: list[DecisionPointOut]


def _not_found(what: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"{what} not found")


@router.get("/sessions")
def get_sessions(db: DbDep) -> list[SessionRecord]:
    """List every session, the most recent start first."""
    return list_sessions(db)


@router.get("/sessions/{session_id}", responses={404: {"description": "No such session"}})
def get_session(session_id: uuid.UUID, db: DbDep) -> SessionRecord:
    """Return one session."""
    session = load_session(db, session_id)
    if session is None:
        raise _not_found("session")
    return session


@router.get("/sessions/{session_id}/hands", responses={404: {"description": "No such session"}})
def get_session_hands(session_id: uuid.UUID, db: DbDep) -> list[HandRecord]:
    """List a session's hands in the order they were played (``client_seq``)."""
    if load_session(db, session_id) is None:
        raise _not_found("session")
    return list_hands(db, session_id)


@router.get("/hands/{hand_id}", responses={404: {"description": "No such hand"}})
def get_hand(hand_id: uuid.UUID, db: DbDep) -> HandDetail:
    """Return one hand with its decision points."""
    hand = load_hand(db, hand_id)
    if hand is None:
        raise _not_found("hand")
    points = [
        DecisionPointOut(
            action_seq=p.point.action_seq,
            classifier_version=p.classifier_version,
            situation=p.point.situation,
            scorable=p.scorable,
            unscored_reason=p.unscored_reason,
        )
        for p in load_stored_decision_points(db, hand_id)
    ]
    return HandDetail(hand=hand, decision_points=points)
