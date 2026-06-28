import { useState, useEffect } from "react";
import { api } from "../api";

const LEVEL_TABS = [
  { label: "Все", value: null },
  { label: "Новичок", value: "novice" },
  { label: "Средний", value: "intermediate" },
  { label: "Продвинутый", value: "advanced" },
  { label: "Про", value: "pro" },
];

const LEVEL_COLORS = {
  novice: "#34d399",
  intermediate: "#22d3ee",
  advanced: "#fbbf24",
  pro: "#f87171",
};

const LEVEL_LABELS = {
  novice: "Новичок",
  intermediate: "Средний",
  advanced: "Продвинутый",
  pro: "Про",
};

function calculateStats(sets) {
  if (!sets || sets.length === 0) {
    return { totalSets: 0, totalDistance: 0, estimatedMinutes: 0 };
  }

  let totalDistance = 0;
  let totalSeconds = 0;

  for (const set of sets) {
    const distance = set.distance_m || 0;
    const reps = set.repetitions || 1;
    const rest = set.rest_seconds || 0;

    totalDistance += distance * reps;
    totalSeconds += (distance / 50) * 60 + rest * reps;
  }

  return {
    totalSets: sets.length,
    totalDistance,
    estimatedMinutes: Math.round(totalSeconds / 60),
  };
}

export default function WorkoutList({ onStartWorkout }) {
  const [workouts, setWorkouts] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchWorkouts() {
      setLoading(true);
      try {
        const data = await api.getWorkouts(selectedLevel);
        if (!cancelled) {
          setWorkouts(data);
        }
      } catch (err) {
        console.error("WorkoutList fetch error:", err);
        if (!cancelled) {
          setWorkouts([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchWorkouts();
    return () => {
      cancelled = true;
    };
  }, [selectedLevel]);

  return (
    <div className="workout-list">
      <h2 className="workout-list-title">Тренировки</h2>

      <div className="level-tabs">
        {LEVEL_TABS.map((tab) => (
          <button
            key={tab.label}
            className={
              "level-tab" + (selectedLevel === tab.value ? " active" : "")
            }
            onClick={() => setSelectedLevel(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="workout-list-loading">
          <p>Загрузка...</p>
        </div>
      ) : workouts.length === 0 ? (
        <div className="workout-list-empty">
          <p>Нет тренировок для выбранного уровня</p>
        </div>
      ) : (
        <div className="workout-cards">
          {workouts.map((workout) => {
            const { totalSets, totalDistance, estimatedMinutes } =
              calculateStats(workout.sets);
            const levelColor = LEVEL_COLORS[workout.level] || "#94a3b8";
            const levelLabel = LEVEL_LABELS[workout.level] || workout.level;

            return (
              <div key={workout.id} className="workout-card">
                <div className="workout-card-header">
                  <h3 className="workout-card-name">{workout.name}</h3>
                  <span
                    className="level-badge"
                    style={{
                      backgroundColor: levelColor + "22",
                      color: levelColor,
                      borderColor: levelColor,
                    }}
                  >
                    {levelLabel}
                  </span>
                </div>

                {workout.focus && (
                  <span className="workout-card-focus">{workout.focus}</span>
                )}

                {workout.description && (
                  <p className="workout-card-description">
                    {workout.description}
                  </p>
                )}

                <div className="workout-card-stats">
                  <span className="workout-stat">
                    {totalSets} {totalSets === 1 ? "сет" : "сетов"}
                  </span>
                  <span className="workout-stat">{totalDistance} м</span>
                  <span className="workout-stat">~{estimatedMinutes} мин</span>
                </div>

                <button
                  className="workout-start-btn"
                  onClick={() => onStartWorkout(workout.id)}
                >
                  Начать
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
