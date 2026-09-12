"""AgentOS application exposing the team through native AG-UI."""

import hmac

from agno.os import AgentOS
from agno.os.interfaces.agui import AGUI
from fastapi import Request
from fastapi.responses import JSONResponse

from workspace_council.config import Settings
from workspace_council.history import recent_team_runs
from workspace_council.team import build_team
from workspace_council.workplace import (
    build_mail_tools,
    build_publisher_tools,
    build_reader_tools,
)

settings = Settings.from_env()
reader_tools = build_reader_tools(settings)
publisher_tools = build_publisher_tools(
    settings,
    allow_writes=True,
    require_confirmation=True,
)
mail_tools = build_mail_tools(settings)
team = build_team(settings, reader_tools, publisher_tools, mail_tools)

agent_os = AgentOS(
    id="workspace-council-os",
    teams=[team],
    interfaces=[AGUI(team=team)],
)
app = agent_os.get_app()


@app.middleware("http")
async def require_agent_auth(request: Request, call_next):
    """Optionally protect AG-UI while leaving readiness endpoints accessible."""
    if settings.agent_auth_header and request.url.path.startswith("/agui"):
        authorization = request.headers.get("Authorization", "")
        if not hmac.compare_digest(authorization, settings.agent_auth_header):
            return JSONResponse(
                status_code=401,
                content={"detail": "Unauthorized AG-UI request"},
            )
    return await call_next(request)


@app.get("/healthz", include_in_schema=False)
async def healthz() -> JSONResponse:
    """Report real MCP readiness without exposing credentials or tool schemas."""
    reader_ready = bool(reader_tools.functions)
    publisher_ready = bool(publisher_tools.functions)
    mail_ready = bool(mail_tools.functions)
    ready = reader_ready and publisher_ready and mail_ready
    return JSONResponse(
        status_code=200 if ready else 503,
        content={
            "status": "ready" if ready else "starting",
            "agent": "workspace-council",
            "model": {
                "provider": "OpenRouter",
                "primary": settings.openrouter_model,
                "fallback": settings.openrouter_fallback_model,
            },
            "search": "Exa",
            "mcp": {
                "reader": reader_ready,
                "publisher": publisher_ready,
                "mail": mail_ready,
            },
        },
    )


@app.get("/historyz", include_in_schema=False)
async def historyz(limit: int = 8) -> JSONResponse:
    """Return sanitized top-level mission records without tools or reasoning."""
    return JSONResponse(content={"runs": recent_team_runs(settings.db_file, limit)})


if __name__ == "__main__":
    agent_os.serve(
        app="workspace_council.app:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
    )
