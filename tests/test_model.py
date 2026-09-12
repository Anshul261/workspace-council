"""Model routing tests that do not make network calls."""

from workspace_council.config import Settings
from workspace_council.model import build_model


def test_openrouter_uses_requested_deepseek_fallback_order() -> None:
    settings = Settings(
        openrouter_api_key="test",
        exa_api_key="test",
        ambiguous_api_key="test",
    )

    model = build_model(settings)

    assert model.provider == "OpenRouter"
    assert model.id == "deepseek/deepseek-v4.1-flash"
    assert model.models == ["deepseek/deepseek-v4-flash-0731"]
