import { useState, useEffect } from "react";
import { api } from "../api";

export default function Dashboard({ onStartWorkout, onNavigate }) {
  const [todayData, setTodayData] = useState(null);
  const [user, setUser] = useState(null);
  const [drills, setDrills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [coachTip, setCoachTip] = useState(null);
  const [coachLoading, setCoachLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const [today, profile, allDrills] = await Promise.all([
          api.getToday(),
          api.getUser(),
          api.getDrills(),
        ]);
        if (!cancelled) {
          setTodayData(today);
          setUser(profile);
          setDrills(allDrills);
        }
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleGetCoachTip() {
    setCoachLoading(true);
    try {
      const result = await api.getCoachTip();
      setCoachTip(result);
    } catch (err) {
      console.error("Coach tip fetch error:", err);
      setCoachTip({ tip: "Не удалось получить совет. Попробуй позже.", source: "error" });
    } finally {
      setCoachLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="dashboard loading">
        <p>{"Загрузка..."}</p>
      </div>
    );
  }

  const workout = todayData?.workout;
  const mastery = user?.mastery ?? {};
  const totalWorkouts = user?.workout_history?.length ?? 0;
  const level = user?.level ?? "novice";

  const masteryEntries = Object.entries(mastery);
  const avgMastery =
    masteryEntries.length > 0
      ? Math.round(
          masteryEntries.reduce((sum, [, v]) => sum + (v.mastery_pct ?? 0), 0) /
            masteryEntries.length
        )
      : 0;

  const topDrills = [...masteryEntries]
    .sort(([, a], [, b]) => (b.mastery_pct ?? 0) - (a.mastery_pct ?? 0))
    .slice(0, 3);

  const drillNameMap = {};
  for (const drill of drills) {
    drillNameMap[drill.id] = drill.name;
  }

  const LEVEL_LABELS = {
    novice: "Новичок",
    intermediate: "Средний",
    advanced: "Продвинутый",
    pro: "Про",
  };
  const levelLabel = LEVEL_LABELS[level] || level;

  return (
    <div className="dashboard">
      {/* Hero */}
      <div className="dashboard-hero">
        <h1>HydroFlow</h1>
        <p>Смотри. Понимай. Повторяй.</p>
      </div>

      {/* Today's Focus */}
      <div className="today-card">
        {todayData?.message && <p className="today-message">{todayData.message}</p>}
        {workout && (
          <div className="today-workout">
            <h3>{workout.name}</h3>
            {workout.focus && <span className="focus-tag">{workout.focus}</span>}
          </div>
        )}
      </div>

      {/* Start Dive */}
      {workout && (
        <button
          className="start-dive-btn"
          onClick={() => onStartWorkout(workout.id)}
        >
          <span className="wave-icon">{"≋"}</span> Начать тренировку
        </button>
      )}

      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-bubble">
          <span className="stat-value">{totalWorkouts}</span>
          <span className="stat-label">Тренировки</span>
        </div>
        <div className="stat-bubble">
          <span className="stat-value">{avgMastery}%</span>
          <span className="stat-label">Мастерство</span>
        </div>
        <div className="stat-bubble">
          <span className="stat-value">{levelLabel}</span>
          <span className="stat-label">Уровень</span>
        </div>
      </div>

      {/* AI Coach */}
      <div className="coach-card">
        <h3>ИИ-тренер</h3>
        {coachTip ? (
          <p className="coach-tip">
            {coachTip.tip}
            {coachTip.source === "fallback" && (
              <span className="coach-tip-note"> (Llama недоступна, стандартный совет)</span>
            )}
          </p>
        ) : (
          <p className="coach-tip-placeholder">
            Получи короткий совет от локальной ИИ-модели перед тренировкой.
          </p>
        )}
        <button
          className="coach-tip-btn"
          onClick={handleGetCoachTip}
          disabled={coachLoading}
        >
          {coachLoading ? "Думаю..." : "Получить совет"}
        </button>
      </div>

      {/* Quick Mastery Overview */}
      {topDrills.length > 0 && (
        <div className="mastery-overview">
          <h3>Ваш прогресс</h3>
          <ul className="mastery-list">
            {topDrills.map(([drillId, drillData]) => (
              <li key={drillId} className="mastery-item">
                <span className="drill-name">{drillNameMap[drillId] || drillId}</span>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${drillData.mastery_pct ?? 0}%` }}
                  />
                </div>
                <span className="drill-pct">{drillData.mastery_pct ?? 0}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
