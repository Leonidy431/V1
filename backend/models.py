from enum import Enum

from pydantic import BaseModel, Field


class DrillCategory(str, Enum):
    warmup = "warmup"
    technique = "technique"
    strength = "strength"
    cooldown = "cooldown"


class UserLevel(str, Enum):
    novice = "novice"
    intermediate = "intermediate"
    advanced = "advanced"
    pro = "pro"


class Drill(BaseModel):
    id: str
    name: str
    youtube_id: str
    time_start: int
    time_end: int
    description: str
    category: DrillCategory


class WorkoutSet(BaseModel):
    drill_id: str
    distance_m: int
    rest_seconds: int
    repetitions: int = 1
    equipment: str | None = None


class Workout(BaseModel):
    id: str
    name: str
    description: str
    level: UserLevel
    sets: list[WorkoutSet]
    focus: str


class DrillMastery(BaseModel):
    drill_id: str
    videos_watched: int = 0
    drills_completed: int = 0
    mastery_pct: float = 0.0


class UserProfile(BaseModel):
    id: str
    name: str
    level: UserLevel
    mastery: dict[str, DrillMastery] = Field(default_factory=dict)
    workout_history: list[str] = Field(default_factory=list)


class WorkoutLog(BaseModel):
    workout_id: str
    completed_sets: list[str]
