import httpx
import pytest

import ai_coach


def _client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_build_prompt_includes_focus_and_level():
    prompt = ai_coach.build_prompt(focus="техника гребка", level="novice")
    assert "техника гребка" in prompt
    assert "novice" in prompt


def test_generate_tip_returns_llama_response_on_success():
    def handler(request):
        assert request.url.path == "/api/generate"
        body = httpx.Response(200, json={"response": " Держи локоть высоко. "})
        return body

    result = ai_coach.generate_tip("техника", "novice", client=_client(handler))
    assert result == {"tip": "Держи локоть высоко.", "source": "llama"}


def test_generate_tip_falls_back_on_empty_response():
    def handler(request):
        return httpx.Response(200, json={"response": "   "})

    result = ai_coach.generate_tip("техника", "novice", client=_client(handler))
    assert result == {"tip": ai_coach.FALLBACK_TIP, "source": "fallback"}


def test_generate_tip_falls_back_on_http_error_status():
    def handler(request):
        return httpx.Response(500, json={"error": "model not found"})

    result = ai_coach.generate_tip("техника", "novice", client=_client(handler))
    assert result == {"tip": ai_coach.FALLBACK_TIP, "source": "fallback"}


def test_generate_tip_falls_back_on_connection_error():
    def handler(request):
        raise httpx.ConnectError("connection refused", request=request)

    result = ai_coach.generate_tip("техника", "novice", client=_client(handler))
    assert result == {"tip": ai_coach.FALLBACK_TIP, "source": "fallback"}


def test_generate_tip_falls_back_on_malformed_json():
    def handler(request):
        return httpx.Response(200, content=b"not json")

    result = ai_coach.generate_tip("техника", "novice", client=_client(handler))
    assert result == {"tip": ai_coach.FALLBACK_TIP, "source": "fallback"}


def test_generate_tip_creates_and_closes_own_client(monkeypatch):
    def handler(request):
        return httpx.Response(200, json={"response": "Совет"})

    mock_client = _client(handler)
    monkeypatch.setattr(httpx, "Client", lambda **kwargs: mock_client)
    result = ai_coach.generate_tip("техника", "novice")
    assert result == {"tip": "Совет", "source": "llama"}


def test_is_available_true_on_200():
    def handler(request):
        assert request.url.path == "/api/tags"
        return httpx.Response(200, json={"models": []})

    assert ai_coach.is_available(client=_client(handler)) is True


def test_is_available_false_on_non_200():
    def handler(request):
        return httpx.Response(404)

    assert ai_coach.is_available(client=_client(handler)) is False


def test_is_available_false_on_connection_error():
    def handler(request):
        raise httpx.ConnectError("connection refused", request=request)

    assert ai_coach.is_available(client=_client(handler)) is False


def test_is_available_creates_and_closes_own_client(monkeypatch):
    def handler(request):
        return httpx.Response(200, json={"models": []})

    mock_client = _client(handler)
    monkeypatch.setattr(httpx, "Client", lambda **kwargs: mock_client)
    assert ai_coach.is_available() is True
