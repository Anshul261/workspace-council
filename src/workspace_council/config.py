"""Typed environment configuration without secret logging."""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv


class ConfigurationError(RuntimeError):
    """Raised when required runtime configuration is missing."""


@dataclass(frozen=True, slots=True)
class Settings:
    openrouter_api_key: str
    exa_api_key: str
    ambiguous_api_key: str
    openrouter_model: str = "deepseek/deepseek-v4.1-flash"
    openrouter_fallback_model: str = "deepseek/deepseek-v4-flash-0731"
    ambiguous_mcp_url: str = "https://app.ambiguous.ai/mcp"
    db_file: str = ".data/workspace-council.db"
    debug: bool = False
    agent_auth_header: str | None = None

    @classmethod
    def from_env(cls) -> Settings:
        # Keep local development credentials out of version control while using
        # the same convention as the Next.js companion app.
        load_dotenv(".env.local")
        load_dotenv()
        ambiguous_key = os.getenv("AMBIGUOUS_API_KEY") or os.getenv("ambiguous_ai")
        values = {
            "OPENROUTER_API_KEY": os.getenv("OPENROUTER_API_KEY"),
            "EXA_API_KEY": os.getenv("EXA_API_KEY"),
            "AMBIGUOUS_API_KEY": ambiguous_key,
        }
        required = (
            "OPENROUTER_API_KEY",
            "EXA_API_KEY",
            "AMBIGUOUS_API_KEY",
        )
        missing = [name for name in required if not values[name]]
        if missing:
            raise ConfigurationError(
                "Missing required environment variables: " + ", ".join(missing)
            )

        return cls(
            openrouter_api_key=str(values["OPENROUTER_API_KEY"]),
            exa_api_key=str(values["EXA_API_KEY"]),
            ambiguous_api_key=str(values["AMBIGUOUS_API_KEY"]),
            openrouter_model=os.getenv(
                "OPENROUTER_MODEL", "deepseek/deepseek-v4.1-flash"
            ),
            openrouter_fallback_model=os.getenv(
                "OPENROUTER_FALLBACK_MODEL", "deepseek/deepseek-v4-flash-0731"
            ),
            ambiguous_mcp_url=os.getenv(
                "AMBIGUOUS_MCP_URL", "https://app.ambiguous.ai/mcp"
            ),
            db_file=os.getenv("AGNO_DB_FILE", ".data/workspace-council.db"),
            debug=os.getenv("AGNO_DEBUG", "false").lower() == "true",
            agent_auth_header=os.getenv("AGENT_AUTH_HEADER") or None,
        )

    def readiness(self) -> dict[str, bool]:
        """Return presence checks only, never credential contents."""
        return {
            "openrouter_api_key": bool(self.openrouter_api_key),
            "openrouter_model": bool(self.openrouter_model),
            "openrouter_fallback_model": bool(self.openrouter_fallback_model),
            "exa_api_key": bool(self.exa_api_key),
            "ambiguous_api_key": bool(self.ambiguous_api_key),
            "ambiguous_mcp_url": bool(self.ambiguous_mcp_url),
        }
