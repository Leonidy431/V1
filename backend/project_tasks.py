"""Project task index for HydroFlow.

A single source of truth for what has shipped and what remains,
grouped by the 12-phase Docker roadmap in DOCKER_DEPLOYMENT_SPEC.md.
Run ``python project_tasks.py`` for a formatted summary, or import
``TASKS`` directly.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Status(str, Enum):
    """Lifecycle state of a task."""

    DONE = "done"
    IN_PROGRESS = "in_progress"
    TODO = "todo"
    BLOCKED = "blocked"


class Priority(str, Enum):
    """Relative urgency of a task."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass(frozen=True)
class Task:
    """One backlog item tied to a project phase."""

    task_id: str
    phase: str
    title: str
    status: Status
    priority: Priority
    notes: str = ""


TASKS: tuple[Task, ...] = (
    # -- Core application ------------------------------------------------
    Task(
        "CORE-01", "core",
        "FastAPI backend: drills, workouts, mastery tracking",
        Status.DONE, Priority.CRITICAL,
    ),
    Task(
        "CORE-02", "core",
        "React frontend: Dashboard, DrillLibrary, WorkoutPlayer, "
        "WaterMode, Profile",
        Status.DONE, Priority.CRITICAL,
    ),
    Task(
        "CORE-03", "core",
        "Dashboard mastery list resolves real drill names",
        Status.DONE, Priority.HIGH,
        "was rendering raw drill IDs before the fix",
    ),
    Task(
        "CORE-04", "core",
        "Water Mode UI fully localized to Russian",
        Status.DONE, Priority.MEDIUM,
        "removed a hardcoded 'Set X of Y' string",
    ),
    Task(
        "CORE-05", "core",
        "CSS coverage audit across all screens",
        Status.DONE, Priority.HIGH,
        "~85 classes used by components had no matching rules",
    ),

    # -- Phase 1-2: containerization --------------------------------------
    Task(
        "DOCKER-01", "phase-1-2",
        "backend/Dockerfile (dev / production stages)",
        Status.DONE, Priority.HIGH,
    ),
    Task(
        "DOCKER-02", "phase-1-2",
        "frontend/Dockerfile (dev / build / production stages)",
        Status.DONE, Priority.HIGH,
    ),
    Task(
        "DOCKER-03", "phase-1-2",
        "Verify image build against real Docker Hub access",
        Status.BLOCKED, Priority.HIGH,
        "sandbox network policy denies Docker Hub's CDN (403); "
        "compose config validated with `docker compose config`, "
        "not with an actual build",
    ),

    # -- Phase 3: orchestration --------------------------------------------
    Task(
        "DOCKER-04", "phase-3",
        "docker-compose.yml (prod) + docker-compose.dev.yml (dev)",
        Status.DONE, Priority.HIGH,
    ),

    # -- Phase 4: database ---------------------------------------------------
    Task(
        "DB-01", "phase-4",
        "PostgreSQL service + SQLAlchemy models",
        Status.TODO, Priority.HIGH,
        "backend is currently in-memory; data is lost on restart",
    ),
    Task(
        "DB-02", "phase-4",
        "Alembic migrations",
        Status.TODO, Priority.MEDIUM,
    ),

    # -- Phase 5: authentication ----------------------------------------------
    Task(
        "AUTH-01", "phase-5",
        "JWT issuance/verification (backend/auth.py)",
        Status.TODO, Priority.HIGH,
    ),
    Task(
        "AUTH-02", "phase-5",
        "users table with argon2 password hashing",
        Status.TODO, Priority.HIGH,
    ),

    # -- Phase 6: reverse proxy / TLS -----------------------------------------
    Task(
        "PROXY-01", "phase-6",
        "Traefik service + Let's Encrypt TLS",
        Status.TODO, Priority.MEDIUM,
    ),

    # -- Phase 7: observability -----------------------------------------------
    Task(
        "OBS-01", "phase-7",
        "HEALTHCHECK in backend and frontend Dockerfiles",
        Status.DONE, Priority.MEDIUM,
    ),
    Task(
        "OBS-02", "phase-7",
        "Prometheus + Grafana services",
        Status.TODO, Priority.LOW,
    ),

    # -- Phase 8: PWA / offline -------------------------------------------------
    Task(
        "PWA-01", "phase-8",
        "Workbox service worker + manifest.json",
        Status.TODO, Priority.MEDIUM,
    ),

    # -- Phase 9: push notifications --------------------------------------------
    Task(
        "PUSH-01", "phase-9",
        "Web Push API + VAPID keys",
        Status.TODO, Priority.LOW,
    ),

    # -- Phase 10: advanced features (ML + AI Coach) -----------------------------
    Task(
        "ML-01", "phase-10",
        "ml-worker service for Video Match (MediaPipe pose)",
        Status.TODO, Priority.LOW,
    ),
    Task(
        "AI-01", "phase-10",
        "AI Coach: local Llama tip via Ollama (backend/ai_coach.py)",
        Status.DONE, Priority.HIGH,
        "GET /api/coach/tip and /api/coach/status; falls back to a "
        "static tip when Ollama is unreachable",
    ),
    Task(
        "AI-02", "phase-10",
        "Verify AI Coach against a real running Ollama instance",
        Status.BLOCKED, Priority.MEDIUM,
        "ollama.com is also denied by the sandbox network policy "
        "(403); tested here only via httpx.MockTransport — needs a "
        "real run on a host with Ollama installed",
    ),
    Task(
        "AI-03", "phase-10",
        "Dashboard 'AI-совет дня' card calling /api/coach/tip",
        Status.DONE, Priority.MEDIUM,
    ),

    # -- Phase 11: testing / CI/CD ------------------------------------------------
    Task(
        "CI-01", "phase-11",
        "backend/test_main.py + test_ai_coach.py, 99%+ coverage",
        Status.DONE, Priority.HIGH,
    ),
    Task(
        "CI-02", "phase-11",
        "e2e/test_hydroflow.py (Playwright, 22 scenarios)",
        Status.DONE, Priority.HIGH,
    ),
    Task(
        "CI-03", "phase-11",
        ".github/workflows/ci.yml",
        Status.TODO, Priority.HIGH,
    ),

    # -- Phase 12: security / image hardening --------------------------------------
    Task(
        "SEC-01", "phase-12",
        "Non-root USER in backend/Dockerfile",
        Status.DONE, Priority.MEDIUM,
    ),
    Task(
        "SEC-02", "phase-12",
        "trivy image scan step in CI",
        Status.TODO, Priority.MEDIUM,
    ),
    Task(
        "SEC-03", "phase-12",
        ".github/dependabot.yml",
        Status.TODO, Priority.LOW,
    ),
)


def by_status(status: Status) -> tuple[Task, ...]:
    """Return every task in the given status."""
    return tuple(task for task in TASKS if task.status is status)


def by_phase(phase: str) -> tuple[Task, ...]:
    """Return every task belonging to the given phase."""
    return tuple(task for task in TASKS if task.phase == phase)


def summary() -> str:
    """Return a plain-text status summary grouped by phase."""
    lines: list[str] = []
    phases = sorted({task.phase for task in TASKS})
    for phase in phases:
        phase_tasks = by_phase(phase)
        done = sum(1 for task in phase_tasks if task.status is Status.DONE)
        lines.append(f"{phase} ({done}/{len(phase_tasks)} done)")
        for task in phase_tasks:
            lines.append(f"  [{task.status.value:11}] {task.task_id}: {task.title}")
    return "\n".join(lines)


if __name__ == "__main__":
    print(summary())
