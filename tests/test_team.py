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


def test_critic_review_accepts_empty_optional_ledger_sections() -> None:
    result = record_critic_review.entrypoint(
        verdict="APPROVED",
        blocking_findings=[],
        material_findings=[],
        minor_findings=[],
    )

    assert json.loads(result) == {
        "verdict": "APPROVED",
        "blocking_findings": [],
        "material_findings": [],
        "minor_findings": [],
        "resolved_findings": [],
        "required_revisions": [],
    }


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
    assert "Treat empty, visibly truncated, or structurally incomplete" in instructions
    assert "Do not end the run while a requested artifact is incomplete" in instructions
    assert "Never delegate publication unless the latest critic verdict is APPROVED" in instructions
    assert team.max_iterations == 12
    assert team.num_history_runs == 2
    assert team.max_tool_calls_from_history == 4
    assert team.add_team_history_to_members is False

    critic = next(member for member in team.members if member.id == "quality-critic")
    critic_instructions = "\n".join(critic.instructions or [])
    assert "first and mandatory output action" in critic_instructions
