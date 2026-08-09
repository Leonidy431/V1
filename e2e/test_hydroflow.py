"""
End-to-end tests against the running dev servers (backend :8000, frontend :5173).

Run with:
    cd backend && uvicorn main:app --port 8000 &
    cd frontend && npm run dev -- --port 5173 &
    pytest e2e/ --browser chromium
"""

import re

import pytest

pytestmark = pytest.mark.usefixtures("hydroflow_page")


# ---------- Dashboard ----------

def test_dashboard_renders_title_and_tagline(hydroflow_page):
    assert "HydroFlow" in hydroflow_page.locator("h1").first.inner_text()
    assert hydroflow_page.locator(".dashboard-hero p").inner_text() == "Смотри. Понимай. Повторяй."


def test_dashboard_stats_row_has_three_bubbles(hydroflow_page):
    assert hydroflow_page.locator(".stat-bubble").count() == 3


def test_dashboard_level_stat_is_localized(hydroflow_page):
    level_text = hydroflow_page.locator(".stat-bubble").nth(2).inner_text()
    for raw_enum in ("novice", "intermediate", "advanced", "pro"):
        assert raw_enum not in level_text


def test_dashboard_mastery_list_shows_real_drill_names(hydroflow_page):
    names = hydroflow_page.locator(".mastery-item .drill-name").all_inner_texts()
    assert names, "expected at least one mastery item"
    assert all(not n.startswith("drill-") for n in names)


def test_dashboard_start_dive_navigates_to_player(hydroflow_page):
    hydroflow_page.locator(".start-dive-btn").click()
    hydroflow_page.wait_for_timeout(600)
    assert hydroflow_page.locator(".workout-player").count() == 1


def test_dashboard_ai_coach_returns_a_tip(hydroflow_page):
    page = hydroflow_page
    assert page.locator(".coach-card").count() == 1
    page.locator(".coach-tip-btn").click()
    page.wait_for_timeout(1000)
    tip_text = page.locator(".coach-tip").inner_text()
    assert tip_text.strip() != ""


# ---------- Drill Library ----------

def test_drills_category_filters_match_seed_data(nav):
    page = nav("Дриллы")
    expected = {
        "Все": 8,
        "Разминка": 1,
        "Техника": 4,
        "Сила": 2,
        "Заминка": 1,
    }
    for label, count in expected.items():
        page.locator(f".category-tab:has-text('{label}')").click()
        page.wait_for_timeout(300)
        assert page.locator(".drill-card").count() == count, f"category {label}"


def test_drills_search_filters_by_name(nav):
    page = nav("Дриллы")
    page.fill(".drill-search-input", "дыхание")
    page.wait_for_timeout(300)
    assert page.locator(".drill-card").count() == 1


def test_drill_video_overlay_has_correct_timecode(nav):
    page = nav("Дриллы")
    page.locator(".drill-card").first.click()
    page.wait_for_timeout(400)
    src = page.locator(".video-overlay iframe").get_attribute("src")
    assert "youtube.com/embed/" in src
    assert "start=" in src and "end=" in src


def test_drill_video_overlay_closes(nav):
    page = nav("Дриллы")
    page.locator(".drill-card").first.click()
    page.wait_for_timeout(400)
    page.locator(".video-close-btn").click()
    page.wait_for_timeout(300)
    assert page.locator(".video-overlay").count() == 0


# ---------- Workout List ----------

def test_workouts_level_filters_match_seed_data(nav):
    page = nav("Тренировки")
    expected = {
        "Все": 3,
        "Новичок": 1,
        "Средний": 1,
        "Продвинутый": 1,
        "Про": 0,
    }
    for label, count in expected.items():
        page.locator(".level-tab", has_text=re.compile(f"^{re.escape(label)}$")).click()
        page.wait_for_timeout(300)
        assert page.locator(".workout-card").count() == count, f"level {label}"


# ---------- Workout Player ----------

def _start_first_novice_workout(page):
    page.locator("nav.bottom-nav >> text=Тренировки").click()
    page.wait_for_timeout(400)
    page.locator(".level-tab", has_text=re.compile("^Новичок$")).click()
    page.wait_for_timeout(300)
    page.locator(".workout-card").first.locator("button:has-text('Начать')").click()
    page.wait_for_timeout(600)
    return page


def test_land_mode_shows_set_cards(hydroflow_page):
    page = _start_first_novice_workout(hydroflow_page)
    assert page.locator(".set-card").count() == 5


def test_land_mode_set_click_opens_video(hydroflow_page):
    page = _start_first_novice_workout(hydroflow_page)
    page.locator(".set-card").nth(1).click()
    page.wait_for_timeout(400)
    assert page.locator(".video-overlay").count() == 1


def test_water_mode_shows_distance_and_reps(hydroflow_page):
    page = _start_first_novice_workout(hydroflow_page)
    page.locator(".mode-btn:has-text('Вода')").click()
    page.wait_for_timeout(400)
    assert page.locator(".water-mode").count() == 1
    assert "m" in page.locator(".water-distance").inner_text()
    assert "Повтор" in page.locator(".water-rep-counter").inner_text()


def test_water_mode_set_indicator_is_localized(hydroflow_page):
    page = _start_first_novice_workout(hydroflow_page)
    page.locator(".mode-btn:has-text('Вода')").click()
    page.wait_for_timeout(400)
    # .water-set-indicator is styled text-transform: uppercase, so compare
    # case-insensitively against the underlying (not CSS-rendered) text.
    indicator = page.locator(".water-set-indicator").text_content().lower()
    assert "сет" in indicator and "из" in indicator
    assert "set" not in indicator and " of " not in indicator


def test_water_mode_rest_phase_after_marking_done(hydroflow_page):
    page = _start_first_novice_workout(hydroflow_page)
    page.locator(".mode-btn:has-text('Вода')").click()
    page.wait_for_timeout(400)
    page.locator(".water-btn-done").click()
    page.wait_for_timeout(400)
    assert page.locator(".water-timer.rest").count() == 1
    assert page.locator(".water-countdown").inner_text().strip() != ""


def test_water_mode_skip_rest(hydroflow_page):
    page = _start_first_novice_workout(hydroflow_page)
    page.locator(".mode-btn:has-text('Вода')").click()
    page.wait_for_timeout(400)
    page.locator(".water-btn-done").click()
    page.wait_for_timeout(400)
    page.locator(".water-btn:has-text('Пропустить')").click()
    page.wait_for_timeout(400)
    # should advance out of the rest phase
    assert page.locator(".water-timer.rest").count() == 0


def test_water_mode_exit_returns_to_land(hydroflow_page):
    page = _start_first_novice_workout(hydroflow_page)
    page.locator(".mode-btn:has-text('Вода')").click()
    page.wait_for_timeout(400)
    page.locator(".water-btn:has-text('Назад')").click()
    page.wait_for_timeout(400)
    assert page.locator(".land-mode").count() == 1


def test_completing_all_sets_returns_to_dashboard(hydroflow_page):
    page = _start_first_novice_workout(hydroflow_page)
    page.locator(".mode-btn:has-text('Вода')").click()
    page.wait_for_timeout(300)
    for _ in range(10):
        next_btn = page.locator(".water-btn:has-text('Далее')")
        if next_btn.count() == 0:
            break
        next_btn.click()
        page.wait_for_timeout(300)
        if page.locator(".dashboard-hero").count() > 0:
            break
    assert page.locator(".dashboard-hero").count() == 1


# ---------- Profile ----------

def test_profile_renders_mastery_circle_and_cards(nav):
    page = nav("Профиль")
    assert page.locator(".profile").count() == 1
    assert page.locator(".mastery-circle").count() == 1
    assert page.locator(".mastery-card").count() == 8


def test_profile_level_badge_is_localized(nav):
    page = nav("Профиль")
    badge = page.locator(".level-badge").inner_text()
    for raw_enum in ("novice", "intermediate", "advanced", "pro"):
        assert raw_enum not in badge


def test_profile_level_progression_has_four_steps(nav):
    page = nav("Профиль")
    assert page.locator(".level-step").count() == 4


# ---------- Cross-screen: no console errors ----------

def test_no_unexpected_console_errors_across_full_journey(hydroflow_page):
    page = hydroflow_page
    errors = []

    def on_console(msg):
        if msg.type != "error":
            return
        text = msg.text
        if any(s in text for s in ("youtube.com", "ytimg.com", "ERR_TUNNEL", "ERR_CONNECTION_RESET", "404")):
            return
        errors.append(text)

    page.on("console", on_console)
    page.on("pageerror", lambda exc: errors.append(str(exc)))

    for label in ("Дриллы", "Тренировки", "Профиль", "Главная"):
        page.locator(f"nav.bottom-nav >> text={label}").click()
        page.wait_for_timeout(300)

    assert errors == []
