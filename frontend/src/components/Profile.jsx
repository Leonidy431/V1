import { useState, useEffect } from "react";
import { api } from "../api";

const LEVEL_LABELS = {
  novice: "Новичок",
  intermediate: "Средний",
  advanced: "Продвинутый",
  pro: "Про",
};

const LEVEL_ORDER = ["novice", "intermediate", "advanced", "pro"];

function getInitials(name) {
  if (!name) return "≋";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

function getMasteryBarColor(pct) {
  if (pct <= 33) return "#ef5350";
  if (pct <= 66) return "#ffa726";
  return "linear-gradient(90deg, #66bb6a, #26c6da)";
}

export default function Profile({ onNavigate }) {
  const [user, setUser] = useState(null);
  const [drills, setDrills] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const [profile, allDrills] = await Promise.all([
          api.getUser(),
          api.getDrills(),
        ]);
        if (!cancelled) {
          setUser(profile);
          setDrills(allDrills);
        }
      } catch (err) {
        console.error("Profile fetch error:", err);
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

  if (loading) {
    return (
      <div className="profile loading">
        <p>{"Загрузка..."}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="profile error">
        <p>Не удалось загрузить профиль</p>
      </div>
    );
  }

  const mastery = user.mastery ?? {};
  const workoutHistory = user.workout_history ?? [];
  const totalWorkouts = workoutHistory.length;
  const level = user.level ?? "novice";
  const levelIndex = LEVEL_ORDER.indexOf(level);
  const levelLabel = LEVEL_LABELS[level] || "Новичок";

  // Build drill name lookup from fetched drills
  const drillNameMap = {};
  if (drills) {
    for (const drill of drills) {
      drillNameMap[drill.id] = drill.name;
    }
  }

  // Mastery entries sorted by mastery_pct descending
  const masteryEntries = Object.entries(mastery)
    .map(([key, data]) => ({
      key,
      drillId: data.drill_id ?? key,
      name: drillNameMap[data.drill_id ?? key] || data.drill_id || key,
      mastery_pct: data.mastery_pct ?? 0,
      videos_watched: data.videos_watched ?? 0,
      drills_completed: data.drills_completed ?? 0,
    }))
    .sort((a, b) => b.mastery_pct - a.mastery_pct);

  // Average mastery
  const avgMastery =
    masteryEntries.length > 0
      ? Math.round(
          masteryEntries.reduce((sum, entry) => sum + entry.mastery_pct, 0) /
            masteryEntries.length
        )
      : 0;

  return (
    <div className="profile">
      {/* User Header */}
      <div className="profile-header">
        <div className="avatar-circle">
          <span className="avatar-initials">{getInitials(user.name)}</span>
        </div>
        <div className="profile-info">
          <h2 className="profile-name">{user.name || "Пловец"}</h2>
          <span className="level-badge">{levelLabel}</span>
          <span className="workout-count">
            {totalWorkouts} {totalWorkouts === 1 ? "тренировка" : "тренировок"}
          </span>
        </div>
      </div>

      {/* Overall Mastery */}
      <div className="mastery-overview">
        <div
          className="mastery-circle"
          style={{
            background: `conic-gradient(#26c6da ${avgMastery * 3.6}deg, #1e2a3a ${avgMastery * 3.6}deg)`,
          }}
        >
          <div className="mastery-circle-inner">
            <span className="mastery-circle-value">{avgMastery}%</span>
          </div>
        </div>
        <span className="mastery-overview-label">Общее мастерство</span>
      </div>

      {/* Level Progression */}
      <div className="level-progression">
        <div className="level-track">
          {LEVEL_ORDER.map((step, idx) => (
            <div
              key={step}
              className={
                "level-step" +
                (idx <= levelIndex ? " reached" : "") +
                (step === level ? " current" : "")
              }
            >
              <div className="level-dot" />
              <span className="level-step-label">{LEVEL_LABELS[step]}</span>
            </div>
          ))}
          <div
            className="level-fill"
            style={{ width: `${(levelIndex / (LEVEL_ORDER.length - 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Mastery Breakdown */}
      {masteryEntries.length > 0 && (
        <div className="mastery-breakdown">
          <h3>Мастерство по упражнениям</h3>
          <div className="mastery-list">
            {masteryEntries.map((entry) => {
              const barColor = getMasteryBarColor(entry.mastery_pct);
              const barStyle =
                entry.mastery_pct > 66
                  ? { width: `${entry.mastery_pct}%`, background: barColor }
                  : { width: `${entry.mastery_pct}%`, backgroundColor: barColor };

              return (
                <div key={entry.key} className="mastery-card">
                  <div className="mastery-card-header">
                    <span className="mastery-drill-name">{entry.name}</span>
                    <span className="mastery-pct">{entry.mastery_pct}%</span>
                  </div>
                  <div className="mastery-bar">
                    <div className="mastery-bar-fill" style={barStyle} />
                  </div>
                  <div className="mastery-card-stats">
                    <span className="mastery-stat">
                      <span className="stat-icon">&#128065;</span>{" "}
                      {entry.videos_watched}
                    </span>
                    <span className="mastery-stat">
                      <span className="stat-icon">&#10003;</span>{" "}
                      {entry.drills_completed}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Workout History */}
      <div className="workout-history">
        <h3>История тренировок</h3>
        <p className="workout-history-count">
          Всего тренировок: {totalWorkouts}
        </p>
        {totalWorkouts > 0 && (
          <ul className="workout-history-list">
            {workoutHistory.map((entry, idx) => (
              <li key={typeof entry === "object" ? entry.id || idx : idx} className="workout-history-item">
                {typeof entry === "object" ? entry.id || `Тренировка ${idx + 1}` : entry}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
