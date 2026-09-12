"""OpenRouter model factory."""

from agno.models.openrouter import OpenRouter

from workspace_council.config import Settings


def build_model(settings: Settings) -> OpenRouter:
    """Use a low-cost DeepSeek model with an ordered OpenRouter fallback."""
    return OpenRouter(
        id=settings.openrouter_model,
        models=[settings.openrouter_fallback_model],
        api_key=settings.openrouter_api_key,
        max_tokens=2048,
        temperature=0.2,
        retries=2,
        exponential_backoff=True,
    )
