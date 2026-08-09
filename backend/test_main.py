import importlib
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import main as main_module


@pytest.fixture
def client():
    importlib.reload(main_module)
    return TestClient(main_module.app)


# ---------- Drills ----------

def test_get_all_drills(client):
    resp = client.get("/api/drills")
    assert resp.status_code == 200
    assert len(resp.json()) == 8


@pytest.mark.parametrize("category,expected_count", [
    ("warmup", 1),
    ("technique", 4),
    ("strength", 2),
    ("cooldown", 1),
])
def test_get_drills_by_category(client, category, expected_count):
    resp = client.get(f"/api/drills?category={category}")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == expected_count
    assert all(d["category"] == category for d in data)


def test_get_drill_found(client):
    resp = client.get("/api/drills/drill-01")
    assert resp.status_code == 200
    assert resp.json()["id"] == "drill-01"


def test_get_drill_not_found(client):
    resp = client.get("/api/drills/nonexistent")
    assert resp.status_code == 404


# ---------- Workouts ----------

def test_get_all_workouts(client):
    resp = client.get("/api/workouts")
    assert resp.status_code == 200
    assert len(resp.json()) == 3


@pytest.mark.parametrize("level,expected_count", [
    ("novice", 1),
    ("intermediate", 1),
    ("advanced", 1),
    ("pro", 0),
])
def test_get_workouts_by_level(client, level, expected_count):
    resp = client.get(f"/api/workouts?level={level}")
    assert resp.status_code == 200
    assert len(resp.json()) == expected_count


def test_get_workout_found_enriches_sets(client):
    resp = client.get("/api/workouts/workout-01")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "workout-01"
    assert all(s["drill"] is not None and s["drill"]["id"] == s["drill_id"] for s in data["sets"])


def test_get_workout_not_found(client):
    resp = client.get("/api/workouts/nonexistent")
    assert resp.status_code == 404


def test_get_workout_with_missing_drill_reference(client):
    from models import WorkoutSet

    workout = main_module.workouts_db["workout-01"]
    workout.sets.append(WorkoutSet(drill_id="ghost-drill", distance_m=10, rest_seconds=10))
    resp = client.get("/api/workouts/workout-01")
    assert resp.status_code == 200
    assert resp.json()["sets"][-1]["drill"] is None


# ---------- User ----------

def test_get_user_default(client):
    resp = client.get("/api/user")
    assert resp.status_code == 200
    data = resp.json()
    assert data["level"] == "novice"
    assert data["workout_history"] == []


@pytest.mark.parametrize("level", ["novice", "intermediate", "advanced", "pro"])
def test_set_user_level(client, level):
    resp = client.post(f"/api/user/level?level={level}")
    assert resp.status_code == 200
    assert resp.json()["level"] == level


# ---------- Watch drill / mastery ----------

def test_watch_drill_first_time(client):
    resp = client.post("/api/user/watch/drill-01")
    assert resp.status_code == 200
    data = resp.json()
    assert data["videos_watched"] == 1
    assert data["mastery_pct"] == 10.0


def test_watch_drill_accumulates(client):
    client.post("/api/user/watch/drill-01")
    resp = client.post("/api/user/watch/drill-01")
    data = resp.json()
    assert data["videos_watched"] == 2
    assert data["mastery_pct"] == 20.0


def test_watch_drill_caps_at_100(client):
    resp = None
    for _ in range(15):
        resp = client.post("/api/user/watch/drill-01")
    assert resp.json()["mastery_pct"] == 100.0


def test_watch_drill_not_found(client):
    resp = client.post("/api/user/watch/nonexistent")
    assert resp.status_code == 404


def test_watch_drill_creates_mastery_entry_if_missing(client):
    del main_module.user_db.mastery["drill-02"]
    resp = client.post("/api/user/watch/drill-02")
    assert resp.status_code == 200
    assert resp.json()["mastery_pct"] == 10.0


# ---------- Complete workout ----------

def test_complete_workout_updates_mastery_and_history(client):
    resp = client.post(
        "/api/user/complete-workout",
        json={"workout_id": "workout-01", "completed_sets": ["drill-04", "drill-07"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["workout_history"] == ["workout-01"]
    assert data["mastery"]["drill-04"]["drills_completed"] == 1
    assert data["mastery"]["drill-04"]["mastery_pct"] == 5.0
    assert data["mastery"]["drill-07"]["drills_completed"] == 1


def test_complete_workout_not_found(client):
    resp = client.post(
        "/api/user/complete-workout",
        json={"workout_id": "nonexistent", "completed_sets": []},
    )
    assert resp.status_code == 404


def test_complete_workout_caps_mastery_at_100(client):
    resp = None
    for _ in range(25):
        resp = client.post(
            "/api/user/complete-workout",
            json={"workout_id": "workout-01", "completed_sets": ["drill-04"]},
        )
    assert resp.json()["mastery"]["drill-04"]["mastery_pct"] == 100.0


def test_complete_workout_creates_mastery_entry_if_missing(client):
    del main_module.user_db.mastery["drill-04"]
    resp = client.post(
        "/api/user/complete-workout",
        json={"workout_id": "workout-01", "completed_sets": ["drill-04"]},
    )
    assert resp.status_code == 200
    assert resp.json()["mastery"]["drill-04"]["drills_completed"] == 1


def test_complete_workout_ignores_sets_not_completed(client):
    resp = client.post(
        "/api/user/complete-workout",
        json={"workout_id": "workout-01", "completed_sets": []},
    )
    assert resp.status_code == 200
    assert resp.json()["mastery"]["drill-04"]["drills_completed"] == 0
    assert resp.json()["workout_history"] == ["workout-01"]


# ---------- Today suggestion ----------

def test_today_suggestion_matches_user_level(client):
    resp = client.get("/api/today")
    assert resp.status_code == 200
    data = resp.json()
    assert data["workout"]["level"] == "novice"
    assert "Сегодня работаем над:" in data["message"]


def test_today_suggestion_falls_back_when_no_matching_level(client):
    client.post("/api/user/level?level=pro")
    resp = client.get("/api/today")
    assert resp.status_code == 200
    assert resp.json()["workout"]["id"] in main_module.workouts_db


def test_today_suggestion_rotates_through_history(client):
    payload = {"workout_id": "workout-01", "completed_sets": []}
    client.post("/api/user/complete-workout", json=payload)
    resp1 = client.get("/api/today")
    client.post("/api/user/complete-workout", json=payload)
    resp2 = client.get("/api/today")
    # only one novice workout exists, so history_len % 1 always selects it
    assert resp1.json()["workout"]["id"] == resp2.json()["workout"]["id"] == "workout-01"


# ---------- Static file mount branch ----------

def test_frontend_dist_not_mounted_when_absent(client):
    resp = client.get("/")
    assert resp.status_code == 404


def test_frontend_dist_mounted_when_present():
    dist_dir = Path(__file__).resolve().parent.parent / "frontend" / "dist"
    dist_dir.mkdir(parents=True, exist_ok=True)
    (dist_dir / "index.html").write_text("<html><body>HydroFlow</body></html>")
    try:
        importlib.reload(main_module)
        resp = TestClient(main_module.app).get("/")
        assert resp.status_code == 200
        assert "HydroFlow" in resp.text
    finally:
        shutil.rmtree(dist_dir)
        importlib.reload(main_module)


# ---------- AI Coach (Llama, mocked — no real Ollama in CI) ----------

def test_coach_tip_returns_generated_tip(client, monkeypatch):
    monkeypatch.setattr(
        main_module.ai_coach,
        "generate_tip",
        lambda focus, level: {"tip": "Дыши ровнее", "source": "llama"},
    )
    resp = client.get("/api/coach/tip")
    assert resp.status_code == 200
    assert resp.json() == {"tip": "Дыши ровнее", "source": "llama"}


def test_coach_tip_uses_today_workout_focus_and_user_level(client, monkeypatch):
    captured = {}

    def fake_generate_tip(focus, level):
        captured["focus"] = focus
        captured["level"] = level
        return {"tip": "ok", "source": "fallback"}

    monkeypatch.setattr(main_module.ai_coach, "generate_tip", fake_generate_tip)
    client.get("/api/coach/tip")
    assert captured["level"] == "novice"
    assert captured["focus"]


def test_coach_status_reports_available(client, monkeypatch):
    monkeypatch.setattr(main_module.ai_coach, "is_available", lambda: True)
    resp = client.get("/api/coach/status")
    assert resp.status_code == 200
    assert resp.json() == {"available": True}


def test_coach_status_reports_unavailable(client, monkeypatch):
    monkeypatch.setattr(main_module.ai_coach, "is_available", lambda: False)
    resp = client.get("/api/coach/status")
    assert resp.json() == {"available": False}
