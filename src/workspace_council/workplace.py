"""Ambiguous MCP setup with a deliberately small capability surface."""

from __future__ import annotations

from agno.tools.mcp import MCPTools

from workspace_council.config import Settings

READ_TOOL_NAMES = (
    "get_document",
    "list_documents",
    "search_workspace",
)
PUBLISH_TOOL_NAMES = ("create_document", "get_document")
PUBLISH_MUTATION_TOOL_NAMES = ("create_document",)
MAIL_READ_TOOL_NAMES = ("search_mail", "get_email", "list_mail_labels")
MAIL_ACTION_TOOL_NAMES = ("create_draft_email", "batch_modify_emails")
MAIL_TOOL_NAMES = MAIL_READ_TOOL_NAMES + MAIL_ACTION_TOOL_NAMES
DEMO_TOOL_NAMES = tuple(dict.fromkeys(READ_TOOL_NAMES + PUBLISH_MUTATION_TOOL_NAMES))

CURATED_TOOL_SCHEMAS: dict[str, dict[str, object]] = {
    "list_documents": {
        "type": "object",
        "properties": {
            "type": {"type": "string", "enum": ["doc", "sheet", "slide"]},
            "limit": {"type": "integer", "minimum": 1, "maximum": 20},
        },
        "required": ["type", "limit"],
        "additionalProperties": False,
    },
    "get_document": {
        "type": "object",
        "properties": {"id": {"type": "string", "format": "uuid"}},
        "required": ["id"],
        "additionalProperties": False,
    },
    "search_workspace": {
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "modules": {"type": "array", "items": {"type": "string"}},
            "limit": {"type": "integer", "minimum": 1, "maximum": 20},
        },
        "required": ["query", "modules", "limit"],
        "additionalProperties": False,
    },
    "create_document": {
        "type": "object",
        "properties": {
            "type": {"type": "string", "enum": ["doc"]},
            "title": {"type": "string"},
            "content": {"type": "string"},
        },
        "required": ["type", "title", "content"],
        "additionalProperties": False,
    },
    "search_mail": {
        "type": "object",
        "properties": {
            "q": {"type": "string"},
            "limit": {"type": "integer", "minimum": 1, "maximum": 10},
            "detail": {"type": "string", "enum": ["full", "headers", "minimal"]},
        },
        "required": ["q", "limit", "detail"],
        "additionalProperties": False,
    },
    "get_email": {
        "type": "object",
        "properties": {
            "id": {"type": "string", "format": "uuid"},
            "detail": {"type": "string", "enum": ["full", "headers", "minimal"]},
        },
        "required": ["id", "detail"],
        "additionalProperties": False,
    },
    "list_mail_labels": {
        "type": "object",
        "properties": {},
        "additionalProperties": False,
    },
    "create_draft_email": {
        "type": "object",
        "properties": {
            "to": {"type": "array", "items": {"type": "string"}, "maxItems": 10},
            "subject": {"type": "string"},
            "body_markdown": {"type": "string"},
            "labels": {"type": "array", "items": {"type": "string"}, "maxItems": 10},
        },
        "required": ["to", "subject", "body_markdown"],
        "additionalProperties": False,
    },
    "batch_modify_emails": {
        "type": "object",
        "properties": {
            "ids": {
                "type": "array",
                "items": {"type": "string", "format": "uuid"},
                "minItems": 1,
                "maxItems": 10,
            },
            "add_labels": {
                "type": "array",
                "items": {"type": "string"},
                "minItems": 1,
                "maxItems": 5,
            },
        },
        "required": ["ids", "add_labels"],
        "additionalProperties": False,
    },
}


class CuratedMCPTools(MCPTools):
    """Keep the MCP transport while presenting strict, demo-safe tool schemas."""

    async def build_tools(self) -> None:
        await super().build_tools()
        prefix = f"{self.tool_name_prefix}_" if self.tool_name_prefix else ""
        for tool_name, schema in CURATED_TOOL_SCHEMAS.items():
            function = self.functions.get(f"{prefix}{tool_name}")
            if function is not None:
                function.parameters = schema


def build_workplace_tools(
    settings: Settings,
    *,
    name: str = "ambiguous",
    include_tools: list[str] | None = None,
    requires_confirmation_tools: list[str] | None = None,
) -> MCPTools:
    """Create an unconnected toolkit. AgentOS manages its server lifecycle."""
    return CuratedMCPTools(
        name=name,
        url=settings.ambiguous_mcp_url,
        transport="streamable-http",
        headers={"Authorization": f"Bearer {settings.ambiguous_api_key}"},
        timeout_seconds=60,
        include_tools=include_tools,
        requires_confirmation_tools=requires_confirmation_tools,
        tool_name_prefix="ambiguous",
    )


def build_reader_tools(settings: Settings) -> MCPTools:
    """Expose only the document retrieval tools needed by the reader."""
    return build_workplace_tools(
        settings,
        name="ambiguous-reader",
        include_tools=list(READ_TOOL_NAMES),
    )


def build_publisher_tools(
    settings: Settings,
    *,
    allow_writes: bool,
    require_confirmation: bool = True,
) -> MCPTools:
    """Expose read-back plus one create operation, optionally approval-gated."""
    include_tools = list(PUBLISH_TOOL_NAMES if allow_writes else ("get_document",))
    confirmation_tools = (
        list(PUBLISH_MUTATION_TOOL_NAMES)
        if allow_writes and require_confirmation
        else None
    )
    return build_workplace_tools(
        settings,
        name="ambiguous-publisher",
        include_tools=include_tools,
        requires_confirmation_tools=confirmation_tools,
    )


def build_demo_tools(settings: Settings, *, allow_writes: bool) -> MCPTools:
    """Build the single-agent Layer 1 toolkit used by the safety demo."""
    include_tools = list(DEMO_TOOL_NAMES if allow_writes else READ_TOOL_NAMES)
    return build_workplace_tools(
        settings,
        name="ambiguous-demo",
        include_tools=include_tools,
    )


def build_mail_tools(settings: Settings) -> MCPTools:
    """Expose mail reads plus approval-gated draft and explicit-ID labeling."""
    return build_workplace_tools(
        settings,
        name="ambiguous-mail",
        include_tools=list(MAIL_TOOL_NAMES),
        requires_confirmation_tools=list(MAIL_ACTION_TOOL_NAMES),
    )


def discovered_tool_names(tools: MCPTools) -> list[str]:
    return sorted(tools.functions)
