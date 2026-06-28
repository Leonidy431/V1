import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from models import DrillCategory, DrillMastery, UserLevel, WorkoutLog
from seed_data import DEFAULT_USER, DRILLS, WORKOUTS

app = FastAPI(title="HydroFlow", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

drills_db = {d.id: d for d in DRILLS}
workouts_db = {w.id: w for w in WORKOUTS}
user_db = DEFAULT_USER.model_copy(deep=True)


@app.get("/api/drills")
def get_drills(category: DrillCategory | None = None):
    if category:
        return [d for d in drills_db.values() if d.category == category]
    return list(drills_db.values())


@app.get("/api/drills/{drill_id}")
def get_drill(drill_id: str):
    if drill_id not in drills_db:
        raise HTTPException(status_code=404, detail="Drill not found")
    return drills_db[drill_id]


@app.get("/api/workouts")
def get_workouts(level: UserLevel | None = None):
    if level:
        return [w for w in workouts_db.values() if w.level == level]
    return list(workouts_db.values())


@app.get("/api/workouts/{workout_id}")
def get_workout(workout_id: str):
    if workout_id not in workouts_db:
        raise HTTPException(status_code=404, detail="Workout not found")
    workout = workouts_db[workout_id]
    enriched_sets = []
    for s in workout.sets:
        drill = drills_db.get(s.drill_id)
        enriched_sets.append({
            **s.model_dump(),
            "drill": drill.model_dump() if drill else None,
        })
    return {
        **workout.model_dump(exclude={"sets"}),
        "sets": enriched_sets,
    }


@app.get("/api/user")
def get_user():
    return user_db


@app.post("/api/user/level")
def set_user_level(level: UserLevel = Query(...)):
    global user_db
    user_db.level = level
    return user_db


@app.post("/api/user/watch/{drill_id}")
def watch_drill(drill_id: str):
    global user_db
    if drill_id not in drills_db:
        raise HTTPException(status_code=404, detail="Drill not found")
    if drill_id not in user_db.mastery:
        user_db.mastery[drill_id] = DrillMastery(drill_id=drill_id)
    mastery = user_db.mastery[drill_id]
    mastery.videos_watched += 1
    mastery.mastery_pct = min(100.0, mastery.mastery_pct + 10.0)
    return mastery


@app.post("/api/user/complete-workout")
def complete_workout(log: WorkoutLog):
    global user_db
    if log.workout_id not in workouts_db:
        raise HTTPException(status_code=404, detail="Workout not found")
    workout = workouts_db[log.workout_id]
    for s in workout.sets:
        if s.drill_id in log.completed_sets:
            if s.drill_id not in user_db.mastery:
                user_db.mastery[s.drill_id] = DrillMastery(drill_id=s.drill_id)
            mastery = user_db.mastery[s.drill_id]
            mastery.drills_completed += 1
            mastery.mastery_pct = min(100.0, mastery.mastery_pct + 5.0)
    user_db.workout_history.append(log.workout_id)
    return user_db


@app.get("/api/today")
def today_suggestion():
    global user_db
    matching = [w for w in workouts_db.values() if w.level == user_db.level]
    if not matching:
        matching = list(workouts_db.values())
    history_len = len(user_db.workout_history)
    workout = matching[history_len % len(matching)]
    return {
        "message": f"Сегодня работаем над: {workout.focus}",
        "workout": workout,
    }


frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
