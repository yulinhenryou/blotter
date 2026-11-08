"""Serving the built web app from the API process (docs/ARCHITECTURE.md §8)."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from review.api.app import WEB_DIST_ENV, create_app


@pytest.fixture
def dist(tmp_path: Path) -> Path:
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<!doctype html><title>app</title>")
    (tmp_path / "assets" / "app.js").write_text("console.log(1)")
    (tmp_path / "sw.js").write_text("// service worker")
    return tmp_path


def test_files_and_the_app_shell_are_served(dist: Path) -> None:
    client = TestClient(create_app(web_dist=dist))
    assert client.get("/").text == "<!doctype html><title>app</title>"
    assert client.get("/assets/app.js").text == "console.log(1)"
    assert client.get("/sw.js").status_code == 200


def test_app_routes_get_the_app_shell(dist: Path) -> None:
    client = TestClient(create_app(web_dist=dist))
    response = client.get("/capture")
    assert response.status_code == 200
    assert response.text == "<!doctype html><title>app</title>"


def test_the_api_still_answers_and_unknown_api_paths_are_404(dist: Path) -> None:
    client = TestClient(create_app(web_dist=dist))
    assert client.get("/api/v1/health").json()["status"] == "ok"
    assert client.get("/api/v1/no-such-endpoint").status_code == 404
    assert client.get("/api").status_code == 404


def test_the_directory_can_come_from_the_environment(
    dist: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(WEB_DIST_ENV, str(dist))
    assert TestClient(create_app()).get("/capture").status_code == 200


def test_without_a_web_app_only_the_api_is_served(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(WEB_DIST_ENV, raising=False)
    client = TestClient(create_app())
    assert client.get("/").status_code == 404
    assert client.get("/api/v1/health").status_code == 200


def test_a_missing_directory_fails_at_start(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError):
        create_app(web_dist=tmp_path / "missing")
