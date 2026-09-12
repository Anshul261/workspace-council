"""Behavioral contract tests for council coordination and review."""

import json

from workspace_council.config import Settings
from workspace_council.team import build_team, record_critic_review
from workspace_council.workplace import build_publisher_tools, build_reader_tools


def settings() -> Settings:
    return Settings(
        openrouter_api_key="test",
        exa_api_key="test",
        ambiguous_api_key="test",
    )


def test_critic_cannot_approve_with_blocking_findings() -> None:
    result = record_critic_review.entrypoint(
        verdict="APPROVED",
        blocking_findings=["C1 | Unsupported market claim"],
        material_findings=[],
        minor_findings=[],
        resolved_findings=[],
        required_revisions=["C1 | Add a primary source or remove the claim"],
    )

    assert json.loads(result)["verdict"] == "REVISE"


def test_team_requires_clarification_and_critic_re_review() -> None:
    runtime_settings = settings()
    team = build_team(
        runtime_settings,
        build_reader_tools(runtime_settings),
        build_publisher_tools(runtime_settings, allow_writes=True),
    )
    instructions = "\n".join(team.instructions or [])

    assert "exactly one search, no get_contents" in instructions
    assert "ask at most three blocking questions and end the run" in instructions
    assert "Do not search Ambiguous unless the user names a workspace source" in instructions
    assert "delegate the revised artifact and revision ledger back" in instructions
    assert "Never delegate publication unless the latest critic verdict is APPROVED" in instructions
