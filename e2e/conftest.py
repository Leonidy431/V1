import os

import pytest

BASE_URL = os.environ.get("HYDROFLOW_BASE_URL", "http://localhost:5173")


@pytest.fixture(scope="session")
def browser_type_launch_args(browser_type_launch_args):
    # This sandbox ships the full Chromium binary (no separate
    # chrome-headless-shell download), so point Playwright at it directly.
    return {**browser_type_launch_args, "executable_path": "/opt/pw-browsers/chromium"}


@pytest.fixture
def hydroflow_page(page):
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(BASE_URL, wait_until="networkidle")
    page.wait_for_timeout(400)
    return page


@pytest.fixture
def nav(hydroflow_page):
    def _nav(label):
        hydroflow_page.locator(f"nav.bottom-nav >> text={label}").click()
        hydroflow_page.wait_for_timeout(400)
        return hydroflow_page

    return _nav
