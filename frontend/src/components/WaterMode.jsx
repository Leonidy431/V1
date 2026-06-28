import { useState, useEffect, useRef, useCallback } from "react";

export default function WaterMode({
  currentSet,
  setIndex,
  totalSets,
  onNext,
  onComplete,
  onExit,
}) {
  const { drill, distance_m, rest_seconds, repetitions, equipment } =
    currentSet;
  const totalReps = repetitions || 1;

  const [phase, setPhase] = useState("swim"); // "swim" | "rest"
  const [currentRep, setCurrentRep] = useState(1);
  const [restTimer, setRestTimer] = useState(rest_seconds || 0);

  const touchStartX = useRef(null);

  // Reset state when the set changes
  useEffect(() => {
    setPhase("swim");
    setCurrentRep(1);
    setRestTimer(rest_seconds || 0);
  }, [setIndex, rest_seconds]);

  // Countdown timer for rest phase
  useEffect(() => {
    if (phase !== "rest") return;

    if (restTimer <= 0) {
      handleRestEnd();
      return;
    }

    const id = setInterval(() => {
      setRestTimer((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(id);
  }, [phase, restTimer]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRestEnd = useCallback(() => {
    if (currentRep < totalReps) {
      setCurrentRep((prev) => prev + 1);
      setPhase("swim");
      setRestTimer(rest_seconds || 0);
    } else {
      // Last rep done
      if (setIndex < totalSets - 1) {
        onNext();
      } else {
        onComplete();
      }
    }
  }, [currentRep, totalReps, rest_seconds, setIndex, totalSets, onNext, onComplete]);

  const handleRepDone = () => {
    if (rest_seconds > 0) {
      setRestTimer(rest_seconds);
      setPhase("rest");
    } else {
      // No rest period — advance immediately
      if (currentRep < totalReps) {
        setCurrentRep((prev) => prev + 1);
      } else {
        if (setIndex < totalSets - 1) {
          onNext();
        } else {
          onComplete();
        }
      }
    }
  };

  const handleSkipRest = () => {
    handleRestEnd();
  };

  const handleSkipSet = () => {
    if (setIndex < totalSets - 1) {
      onNext();
    } else {
      onComplete();
    }
  };

  // Touch swipe handling
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;

    if (deltaX < -80) {
      // Swipe left → next set
      handleSkipSet();
    } else if (deltaX > 80) {
      // Swipe right → exit
      onExit();
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 0) {
      return `${m}:${s.toString().padStart(2, "0")}`;
    }
    return `${s}`;
  };

  return (
    <div
      className="water-mode"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {equipment && <div className="water-equipment-badge">{equipment}</div>}

      <div className="water-header">
        <span className="water-set-indicator">
          Set {setIndex + 1} of {totalSets}
        </span>
        <h1 className="water-drill-name">{drill?.name}</h1>
      </div>

      {phase === "swim" ? (
        <div className="water-timer">
          <div className="water-distance">{distance_m}m</div>
          <div className="water-rep-counter">
            Повтор {currentRep} / {totalReps}
          </div>
          <button className="water-btn water-btn-done" onClick={handleRepDone}>
            Готово ✓
          </button>
        </div>
      ) : (
        <div className="water-timer rest">
          <div className={`water-countdown breathing`}>
            {formatTime(restTimer)}
          </div>
          <button className="water-btn" onClick={handleSkipRest}>
            Пропустить
          </button>
        </div>
      )}

      <div className="water-controls">
        <button className="water-btn" onClick={onExit}>
          ← Назад
        </button>
        <button className="water-btn" onClick={handleSkipSet}>
          Далее →
        </button>
      </div>
    </div>
  );
}
