import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import WaterMode from "./WaterMode";

const CATEGORY_COLORS = {
  warmup: "#fbbf24",
  technique: "#22d3ee",
  strength: "#f87171",
  cooldown: "#34d399",
};

export default function WorkoutPlayer({ workoutId, onBack, onComplete }) {
  const [workout, setWorkout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentMode, setCurrentMode] = useState("land");
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [selectedDrill, setSelectedDrill] = useState(null);
  const [completedSets, setCompletedSets] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchWorkout() {
      try {
        const data = await api.getWorkout(workoutId);
        if (!cancelled) {
          setWorkout(data);
        }
      } catch (err) {
        console.error("WorkoutPlayer fetch error:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchWorkout();
    return () => {
      cancelled = true;
    };
  }, [workoutId]);

  const handleOpenDrill = useCallback(
    async (drill) => {
      setSelectedDrill(drill);
      try {
        await api.watchDrill(drill.id);
      } catch (err) {
        console.error("watchDrill error:", err);
      }
    },
    []
  );

  const handleCloseDrill = useCallback(() => {
    setSelectedDrill(null);
  }, []);

  const handleNextSet = useCallback(() => {
    if (!workout) return;
    const currentSet = workout.sets[currentSetIndex];
    if (currentSet?.drill) {
      setCompletedSets((prev) =>
        prev.includes(currentSet.drill.id) ? prev : [...prev, currentSet.drill.id]
      );
    }
    if (currentSetIndex < workout.sets.length - 1) {
      setCurrentSetIndex((prev) => prev + 1);
    }
  }, [workout, currentSetIndex]);

  const handleComplete = useCallback(async () => {
    if (!workout) return;
    const lastSet = workout.sets[currentSetIndex];
    const drillId = lastSet?.drill?.id;
    const finalCompleted = drillId && !completedSets.includes(drillId)
      ? [...completedSets, drillId]
      : completedSets;

    try {
      await api.completeWorkout(workoutId, finalCompleted);
    } catch (err) {
      console.error("completeWorkout error:", err);
    }
    onComplete();
  }, [workout, workoutId, currentSetIndex, completedSets, onComplete]);

  if (loading) {
    return (
      <div className="workout-player loading">
        <p>Загрузка тренировки...</p>
      </div>
    );
  }

  if (!workout) {
    return (
      <div className="workout-player error">
        <p>Не удалось загрузить тренировку</p>
        <button className="back-btn" onClick={onBack}>
          Назад
        </button>
      </div>
    );
  }

  const sets = workout.sets || [];

  return (
    <div className="workout-player">
      {/* Header */}
      <div className="workout-player-header">
        <button className="back-btn" onClick={onBack}>
          &larr; Назад
        </button>
        <h2 className="workout-title">{workout.name}</h2>
      </div>

      {/* Progress dots */}
      <div className="progress-dots">
        {sets.map((set, idx) => (
          <span
            key={idx}
            className={
              "progress-dot" +
              (idx === currentSetIndex ? " current" : "") +
              (set.drill && completedSets.includes(set.drill.id) ? " completed" : "")
            }
          />
        ))}
      </div>

      {/* Mode toggle */}
      <div className="mode-toggle">
        <button
          className={"mode-btn" + (currentMode === "land" ? " active" : "")}
          onClick={() => setCurrentMode("land")}
        >
          Суша
        </button>
        <button
          className={"mode-btn" + (currentMode === "water" ? " active" : "")}
          onClick={() => setCurrentMode("water")}
        >
          Вода
        </button>
      </div>

      {/* Land Mode */}
      {currentMode === "land" && (
        <div className="land-mode">
          <div className="sets-list">
            {sets.map((set, idx) => {
              const drill = set.drill;
              const isActive = idx === currentSetIndex;
              const categoryColor =
                CATEGORY_COLORS[drill?.category] || "#90a4ae";

              return (
                <div
                  key={idx}
                  className={"set-card" + (isActive ? " active" : "")}
                  onClick={() => {
                    setCurrentSetIndex(idx);
                    if (drill) handleOpenDrill(drill);
                  }}
                >
                  <div
                    className="category-indicator"
                    style={{ backgroundColor: categoryColor }}
                  />
                  <div className="set-card-content">
                    <div className="set-number">Сет {idx + 1}</div>
                    <div className="drill-name">
                      {drill?.name || "Упражнение"}
                    </div>
                    <div className="set-details">
                      <span className="distance">
                        {set.distance_m}м &times; {set.repetitions}
                      </span>
                      <span className="rest">
                        Отдых: {set.rest_seconds}с
                      </span>
                    </div>
                    {set.equipment && (
                      <span className="equipment-badge">{set.equipment}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Water Mode */}
      {currentMode === "water" && (
        <WaterMode
          currentSet={sets[currentSetIndex]}
          setIndex={currentSetIndex}
          totalSets={sets.length}
          onNext={handleNextSet}
          onComplete={handleComplete}
          onExit={() => setCurrentMode("land")}
        />
      )}

      {/* YouTube Overlay */}
      {selectedDrill && (
        <div className="video-overlay" onClick={handleCloseDrill}>
          <div
            className="video-overlay-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="video-close-btn" onClick={handleCloseDrill}>
              &times;
            </button>
            <div className="video-container">
              <iframe
                src={`https://www.youtube.com/embed/${selectedDrill.youtube_id}?start=${selectedDrill.time_start}&end=${selectedDrill.time_end}&autoplay=1&rel=0&modestbranding=1`}
                title={selectedDrill.name}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div className="video-info">
              <h3 className="video-drill-name">{selectedDrill.name}</h3>
              <p className="video-drill-description">
                {selectedDrill.description}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
