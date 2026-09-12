"""Native Agno specialist agents and coordinating team."""

from __future__ import annotations

import json
from typing import Literal

from agno.agent import Agent
from agno.db.sqlite import SqliteDb
from agno.team import Team
from agno.team.mode import TeamMode
from agno.tools import tool
from agno.tools.exa import ExaTools
from agno.tools.mcp import MCPTools

from workspace_council.config import Settings
from workspace_council.model import build_model


@tool
def record_critic_review(
    verdict: Literal["APPROVED", "REVISE"],
    blocking_findings: list[str],
    material_findings: list[str],
    minor_findings: list[str],
    resolved_findings: list[str],
    required_revisions: list[str],
) -> str:
    """Record the critic's structured verdict and revision todo list.

    Every finding must start with a stable ID such as C1. A verdict cannot be
    approved while blocking or material findings remain open.
    """
    effective_verdict = (
        "REVISE" if blocking_findings or material_findings else verdict
    )
    return json.dumps(
        {
            "verdict": effective_verdict,
            "blocking_findings": blocking_findings,
            "material_findings": material_findings,
            "minor_findings": minor_findings,
            "resolved_findings": resolved_findings,
            "required_revisions": required_revisions,
        }
    )


def build_team(
    settings: Settings,
    reader_tools: MCPTools,
    publisher_tools: MCPTools,
    mail_tools: MCPTools | None = None,
) -> Team:
    model = build_model(settings)
    database = SqliteDb(id="workspace-council-db", db_file=settings.db_file)

    workspace_reader = Agent(
        id="workspace-reader",
        name="Workspace Reader",
        role="Retrieve and interpret source material from Ambiguous",
        model=model,
        db=database,
        tools=[reader_tools],
        tool_call_limit=4,
        instructions=[
            "Use the live MCP tool catalog and its exact schemas.",
            "To list recent docs, call list_documents once with only type='doc' and limit=3.",
            "Do not retry a successful tool call with invented cursor, fields, or notify values.",
            "For document-only workspace search, use modules=['docs']; canonical module IDs are plural app slugs.",
            "Never issue more than one search_workspace call in the same turn.",
            "If search_workspace fails, do not retry it. Fall back to list_documents and get_document once.",
            "Retrieve workspace facts and documents, but never mutate workspace data.",
            "Return record IDs and links when the tools provide them.",
            "Clearly distinguish retrieved facts from inference.",
            "Return only the requested fields and no more than eight concise bullets.",
        ],
        markdown=True,
    )

    researcher = Agent(
        id="web-researcher",
        name="Web Researcher",
        role="Find timely external evidence and preserve source URLs",
        model=model,
        db=database,
        tools=[
            ExaTools(
                api_key=settings.exa_api_key,
                enable_search=True,
                enable_get_contents=True,
                enable_find_similar=False,
                enable_answer=False,
                num_results=3,
                text_length_limit=1600,
                timeout=30,
            )
        ],
        instructions=[
            "Search only when external evidence materially improves the task.",
            "Use at most two focused searches and keep no more than three results per search.",
            "Use get_contents only for the strongest source when the search excerpt is insufficient.",
            "For orientation before clarification, use exactly one search_exa call, do not call get_contents, and return at most 200 words with three links.",
            "Return title, URL, date when available, and relevance for every source.",
            "Never invent a source or claim that a result was opened when it was not.",
            "Return at most three sources with no more than two lines per source.",
        ],
        markdown=True,
    )

    writer = Agent(
        id="editorial-writer",
        name="Editorial Writer",
        role="Turn workspace context and research into polished artifacts",
        model=model,
        db=database,
        instructions=[
            "Write for a busy operator who will scan headings first.",
            "Use decisions, evidence, risks, owners, and next actions when relevant.",
            "Preserve citations supplied by the researcher.",
            "Do not claim an artifact has been published.",
            "Keep the draft under 800 words unless the user requests a longer format.",
            "When revising, address every blocking and material critic finding by its stable ID.",
            "Return the complete revised artifact plus a REVISION LEDGER mapping each finding ID to its repair.",
            "Never silently omit an unresolved critic finding.",
        ],
        markdown=True,
    )

    critic = Agent(
        id="quality-critic",
        name="Quality Critic",
        role="Challenge factual support, completeness, clarity, and actionability",
        model=model,
        db=database,
        tools=[record_critic_review],
        tool_call_limit=2,
        instructions=[
            "Act as an independent adversarial reviewer, not a collaborator seeking agreement.",
            "Assume the draft is wrong until its claims, decisions, and operating model survive challenge.",
            "Test claim-to-source traceability, hidden assumptions, omitted alternatives, security and governance gaps, cost realism, ownership, failure modes, rollback, and measurable success criteria.",
            "Use stable finding IDs C1, C2, and so on. Never silently drop a prior finding during re-review.",
            "Classify each open finding as blocking, material, or minor and state the exact required repair.",
            "On re-review, put every fixed prior ID in resolved_findings and every remaining issue in its severity list.",
            "Call record_critic_review exactly once with the complete verdict and revision todo list.",
            "Use verdict REVISE whenever any blocking or material finding remains open.",
            "Use verdict APPROVED only when another person can act without guessing and no blocking or material finding remains.",
            "After recording the review, return a concise verdict and no rewritten artifact.",
            "Use at most six open findings.",
        ],
        markdown=True,
    )

    publisher = Agent(
        id="workspace-publisher",
        name="Workspace Publisher",
        role="Publish approved artifacts into Ambiguous and verify persistence",
        model=model,
        db=database,
        tools=[publisher_tools],
        tool_call_limit=3,
        instructions=[
            "Use only exact tool names and schemas from the live MCP catalog.",
            "Never overwrite the source record. Create a new record with a clear title.",
            "Before mutation, state the exact proposed title and destination.",
            "After writing, retrieve the returned record ID and verify it exists.",
            "Return the real record ID and link. Never invent either.",
            "Report only the publication outcome and verification evidence.",
            "Refuse publication unless the delegated task includes the latest critic verdict APPROVED and the final revised artifact.",
        ],
        markdown=True,
    )

    members = [workspace_reader, researcher, writer, critic, publisher]
    if mail_tools is not None:
        mail_operator = Agent(
            id="mail-operator",
            name="Mail Operator",
            role="Find relevant mail, prepare drafts, and label explicit messages after approval",
            model=model,
            db=database,
            tools=[mail_tools],
            tool_call_limit=5,
            instructions=[
                "Use only exact tool names and schemas from the live MCP catalog.",
                "Search and read only the minimum mail needed for the requested task.",
                "Create drafts rather than sending mail; no send tool is available.",
                "Before creating a draft, state the recipients, subject, and purpose.",
                "Only label explicit email IDs. Never use a broad search query for mutation.",
                "Never archive, trash, delete, or mark messages read.",
                "Return the real draft or email IDs supplied by Ambiguous.",
            ],
            markdown=True,
        )
        members.append(mail_operator)

    return Team(
        id="workspace-council",
        name="Workspace Council",
        mode=TeamMode.coordinate,
        description=(
            "A team that reads workplace context, researches the web, writes, "
            "critiques, and publishes only after approval."
        ),
        model=model,
        db=database,
        members=members,
        max_iterations=6,
        instructions=[
            "Before drafting, determine whether a missing decision would materially change the answer.",
            "For a broad strategy request with an open platform choice, delegate one lightweight provider-neutral orientation to Web Researcher: exactly one search, no get_contents, at most three links and 200 words.",
            "After that orientation, ask at most three blocking questions and end the run.",
            "For an enterprise cloud data platform memo, ask which cloud provider or cloud-agnostic approach, expected scale and latency, and regulatory or data-residency constraints unless supplied.",
            "Do not draft, critique, publish, or search the workspace during that clarification run.",
            "Do not search Ambiguous unless the user names a workspace source or explicitly asks to use workspace context.",
            "When clarification is unnecessary, restate the requested outcome and proceed.",
            "Delegate workspace retrieval to Workspace Reader only when a bounded workspace source is relevant.",
            "Delegate external research only when it adds decision value.",
            "Have Editorial Writer draft the artifact, then Quality Critic perform an adversarial review.",
            "If the critic verdict is REVISE, delegate the complete draft and complete finding ledger back to Editorial Writer.",
            "After revision, delegate the revised artifact and revision ledger back to Quality Critic for re-review.",
            "Repeat for at most two revision cycles. Track every finding ID as OPEN or RESOLVED.",
            "Never delegate publication unless the latest critic verdict is APPROVED.",
            "If approval is not achieved after two cycles, return preview-only with the remaining findings as explicit todos.",
            "Show the final draft, then delegate publication so the tool's enforced approval card can pause the write.",
            "Do not ask for a separate prose approval before invoking an approval-gated tool.",
            "Complete only after read-back verification, or mark the result preview-only.",
            "Include sources and the real Ambiguous record link when available.",
            "Delegate email lookup, draft creation, or labeling only to Mail Operator when available.",
            "Never claim an email was sent; this council can create drafts but has no send capability.",
            "Do not narrate routine planning. Keep the final response decision-focused and concise.",
        ],
        add_history_to_context=True,
        num_history_runs=5,
        add_team_history_to_members=True,
        share_member_interactions=True,
        enable_agentic_state=False,
        add_session_state_to_context=False,
        show_members_responses=True,
        markdown=True,
        debug_mode=settings.debug,
        telemetry=False,
    )
