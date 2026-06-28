import { useState } from "react";
import Dashboard from "./components/Dashboard";
import DrillLibrary from "./components/DrillLibrary";
import WorkoutList from "./components/WorkoutList";
import WorkoutPlayer from "./components/WorkoutPlayer";
import Profile from "./components/Profile";

export default function App() {
  const [currentScreen, setCurrentScreen] = useState("dashboard");
  const [activeWorkoutId, setActiveWorkoutId] = useState(null);

  const onNavigate = (screen) => setCurrentScreen(screen);

  const onStartWorkout = (workoutId) => {
    setActiveWorkoutId(workoutId);
    setCurrentScreen("player");
  };

  const onBack = () => setCurrentScreen("dashboard");

  const onComplete = () => setCurrentScreen("dashboard");

  const renderScreen = () => {
    switch (currentScreen) {
      case "drills":
        return <DrillLibrary onNavigate={onNavigate} />;
      case "workouts":
        return <WorkoutList onStartWorkout={onStartWorkout} />;
      case "player":
        return (
          <WorkoutPlayer
            workoutId={activeWorkoutId}
            onBack={onBack}
            onComplete={onComplete}
          />
        );
      case "profile":
        return <Profile onNavigate={onNavigate} />;
      default:
        return (
          <Dashboard onStartWorkout={onStartWorkout} onNavigate={onNavigate} />
        );
    }
  };

  return (
    <div className="app-container">
      <div className="screen">{renderScreen()}</div>

      {currentScreen !== "player" && (
        <nav className="bottom-nav">
          <button
            className={`nav-item${currentScreen === "dashboard" ? " active" : ""}`}
            onClick={() => onNavigate("dashboard")}
          >
            <span className="icon">🏠</span>
            <span>Главная</span>
          </button>
          <button
            className={`nav-item${currentScreen === "drills" ? " active" : ""}`}
            onClick={() => onNavigate("drills")}
          >
            <span className="icon">📋</span>
            <span>Дриллы</span>
          </button>
          <button
            className={`nav-item${currentScreen === "workouts" ? " active" : ""}`}
            onClick={() => onNavigate("workouts")}
          >
            <span className="icon">🏊</span>
            <span>Тренировки</span>
          </button>
          <button
            className={`nav-item${currentScreen === "profile" ? " active" : ""}`}
            onClick={() => onNavigate("profile")}
          >
            <span className="icon">👤</span>
            <span>Профиль</span>
          </button>
        </nav>
      )}
    </div>
  );
}
