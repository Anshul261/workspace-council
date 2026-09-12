"""Configuration tests for the required integrations."""

import pytest

from workspace_council.config import ConfigurationError, Settings


def test_loads_openrouter_and_exa_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "openrouter-test")
    monkeypatch.setenv("EXA_API_KEY", "exa-test")
    monkeypatch.setenv("AMBIGUOUS_API_KEY", "ambiguous-test")
    monkeypatch.delenv("OPENROUTER_MODEL", raising=False)
    monkeypatch.delenv("OPENROUTER_FALLBACK_MODEL", raising=False)

    settings = Settings.from_env()

    assert settings.openrouter_model == "deepseek/deepseek-v4.1-flash"
    assert settings.openrouter_fallback_model == "deepseek/deepseek-v4-flash-0731"
    assert all(settings.readiness().values())


def test_requires_exa_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("workspace_council.config.load_dotenv", lambda: None)
    monkeypatch.setenv("OPENROUTER_API_KEY", "openrouter-test")
    monkeypatch.delenv("EXA_API_KEY", raising=False)
    monkeypatch.setenv("AMBIGUOUS_API_KEY", "ambiguous-test")

    with pytest.raises(ConfigurationError, match="EXA_API_KEY"):
        Settings.from_env()


def test_loads_optional_agent_auth_header(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "openrouter-test")
    monkeypatch.setenv("EXA_API_KEY", "exa-test")
    monkeypatch.setenv("AMBIGUOUS_API_KEY", "ambiguous-test")
    monkeypatch.setenv("AGENT_AUTH_HEADER", "Bearer channel-secret")

    settings = Settings.from_env()

    assert settings.agent_auth_header == "Bearer channel-secret"
