import { useState, useEffect, useCallback } from "react";
import { api } from "../api";

const CATEGORY_TABS = [
  { label: "Все", value: null },
  { label: "Разминка", value: "warmup" },
  { label: "Техника", value: "technique" },
  { label: "Сила", value: "strength" },
  { label: "Заминка", value: "cooldown" },
];

const CATEGORY_COLORS = {
  warmup: "#fbbf24",
  technique: "#22d3ee",
  strength: "#f87171",
  cooldown: "#34d399",
};

const CATEGORY_LABELS = {
  warmup: "Разминка",
  technique: "Техника",
  strength: "Сила",
  cooldown: "Заминка",
};

export default function DrillLibrary({ onNavigate }) {
  const [drills, setDrills] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedDrill, setSelectedDrill] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchDrills() {
      setLoading(true);
      try {
        const data = await api.getDrills(selectedCategory);
        if (!cancelled) {
          setDrills(data);
        }
      } catch (err) {
        console.error("DrillLibrary fetch error:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchDrills();
    return () => {
      cancelled = true;
    };
  }, [selectedCategory]);

  const handleOpenDrill = useCallback(async (drill) => {
    setSelectedDrill(drill);
    try {
      await api.watchDrill(drill.id);
    } catch (err) {
      console.error("watchDrill error:", err);
    }
  }, []);

  const handleCloseDrill = useCallback(() => {
    setSelectedDrill(null);
  }, []);

  const filteredDrills = searchQuery
    ? drills.filter((d) =>
        d.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : drills;

  if (loading) {
    return (
      <div className="drill-library loading">
        <p>Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="drill-library">
      {/* Header */}
      <div className="drill-library-header">
        <h2>Библиотека дриллов</h2>
      </div>

      {/* Search */}
      <div className="drill-search">
        <input
          type="text"
          className="drill-search-input"
          placeholder="Поиск по названию..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Category Tabs */}
      <div className="category-tabs">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.label}
            className={
              "category-tab" +
              (selectedCategory === tab.value ? " active" : "")
            }
            style={
              selectedCategory === tab.value && tab.value
                ? { borderColor: CATEGORY_COLORS[tab.value] }
                : undefined
            }
            onClick={() => setSelectedCategory(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Drill Grid */}
      <div className="drill-grid">
        {filteredDrills.length === 0 ? (
          <p className="drill-empty">Дриллы не найдены</p>
        ) : (
          filteredDrills.map((drill) => {
            const categoryColor =
              CATEGORY_COLORS[drill.category] || "#90a4ae";
            const categoryLabel =
              CATEGORY_LABELS[drill.category] || drill.category;

            return (
              <div
                key={drill.id}
                className="drill-card"
                onClick={() => handleOpenDrill(drill)}
              >
                <div
                  className="drill-card-color-strip"
                  style={{ backgroundColor: categoryColor }}
                />
                <div className="drill-card-content">
                  <div className="drill-card-thumbnail">
                    <img
                      src={`https://img.youtube.com/vi/${drill.youtube_id}/mqdefault.jpg`}
                      alt={drill.name}
                      className="drill-thumbnail-img"
                    />
                  </div>
                  <div className="drill-card-info">
                    <h3 className="drill-card-name">{drill.name}</h3>
                    <p className="drill-card-description">
                      {drill.description}
                    </p>
                    <span
                      className="drill-category-badge"
                      style={{
                        backgroundColor: categoryColor,
                      }}
                    >
                      {categoryLabel}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Video Overlay */}
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
