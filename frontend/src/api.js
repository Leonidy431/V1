const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export const api = {
  getDrills: (category) =>
    request(`/drills${category ? `?category=${category}` : ""}`),
  getDrill: (id) => request(`/drills/${id}`),
  getWorkouts: (level) =>
    request(`/workouts${level ? `?level=${level}` : ""}`),
  getWorkout: (id) => request(`/workouts/${id}`),
  getUser: () => request("/user"),
  getToday: () => request("/today"),
  watchDrill: (id) => request(`/user/watch/${id}`, { method: "POST" }),
  completeWorkout: (workoutId, completedSets) =>
    request("/user/complete-workout", {
      method: "POST",
      body: JSON.stringify({
        workout_id: workoutId,
        completed_sets: completedSets,
      }),
    }),
  getCoachTip: () => request("/coach/tip"),
};
