"""Native Agno specialist agents and coordinating team."""

from __future__ import annotations

from agno.agent import Agent
from agno.db.sqlite import SqliteDb
from agno.team import Team
from agno.team.mode import TeamMode
from agno.tools.exa import ExaTools
from agno.tools.mcp import MCPTools

from workspace_council.config import Settings
from workspace_council.model import build_model


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
        ],
        markdown=True,
    )

    critic = Agent(
        id="quality-critic",
        name="Quality Critic",
        role="Challenge factual support, completeness, clarity, and actionability",
        model=model,
        db=database,
        instructions=[
            "Identify unsupported claims, missing evidence, ambiguity, and weak next steps.",
            "Return a short verdict plus exact repairs, not a rewritten artifact.",
            "Approve only when another person could act without guessing.",
            "Use at most six concise findings.",
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
            "Restate the requested outcome and identify missing source context.",
            "Delegate workspace retrieval to Workspace Reader.",
            "Delegate external research only when it adds decision value.",
            "Have Editorial Writer draft the artifact, then Quality Critic review it.",
            "Repair material issues before proposing publication.",
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
