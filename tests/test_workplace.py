"""Capability-boundary tests for the Ambiguous MCP integration."""

from workspace_council.config import Settings
from workspace_council.workplace import (
    DEMO_TOOL_NAMES,
    MAIL_ACTION_TOOL_NAMES,
    MAIL_TOOL_NAMES,
    PUBLISH_MUTATION_TOOL_NAMES,
    PUBLISH_TOOL_NAMES,
    READ_TOOL_NAMES,
    build_demo_tools,
    build_mail_tools,
    build_publisher_tools,
    build_reader_tools,
)


def settings() -> Settings:
    return Settings(
        openrouter_api_key="test",
        exa_api_key="test",
        ambiguous_api_key="test",
    )


def test_reader_uses_explicit_read_allowlist() -> None:
    tools = build_reader_tools(settings())

    assert tools.include_tools == list(READ_TOOL_NAMES)
    assert tools.requires_confirmation_tools == []


def test_web_publisher_gates_its_only_write() -> None:
    tools = build_publisher_tools(
        settings(),
        allow_writes=True,
        require_confirmation=True,
    )

    assert tools.include_tools == list(PUBLISH_TOOL_NAMES)
    assert tools.requires_confirmation_tools == list(PUBLISH_MUTATION_TOOL_NAMES)


def test_preview_publisher_cannot_write() -> None:
    tools = build_publisher_tools(settings(), allow_writes=False)

    assert tools.include_tools == ["get_document"]
    assert tools.requires_confirmation_tools == []


def test_layer_one_demo_only_adds_create_after_commit() -> None:
    preview = build_demo_tools(settings(), allow_writes=False)
    commit = build_demo_tools(settings(), allow_writes=True)

    assert preview.include_tools == list(READ_TOOL_NAMES)
    assert commit.include_tools == list(DEMO_TOOL_NAMES)


def test_mail_actions_are_explicit_and_confirmation_gated() -> None:
    tools = build_mail_tools(settings())

    assert tools.include_tools == list(MAIL_TOOL_NAMES)
    assert tools.requires_confirmation_tools == list(MAIL_ACTION_TOOL_NAMES)
    assert "send_email" not in tools.include_tools
