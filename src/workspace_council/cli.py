"""Local diagnostics and terminal interface for the AgentOS team."""

from __future__ import annotations

import argparse
import asyncio
import json
from contextlib import AsyncExitStack
from uuid import uuid4

from agno.agent import Agent

from workspace_council.config import ConfigurationError, Settings
from workspace_council.model import build_model
from workspace_council.team import build_team
from workspace_council.workplace import (
    MAIL_TOOL_NAMES,
    PUBLISH_MUTATION_TOOL_NAMES,
    READ_TOOL_NAMES,
    build_demo_tools,
    build_publisher_tools,
    build_reader_tools,
    build_workplace_tools,
    discovered_tool_names,
)


async def doctor(settings: Settings, *, test_model: bool, test_mcp: bool) -> int:
    print(json.dumps({"configuration": settings.readiness()}, indent=2))

    if test_model:
        from agno.agent import Agent

        from workspace_council.model import build_model

        probe = Agent(
            id="openrouter-readiness-probe",
            model=build_model(settings),
            instructions="Return only the exact text requested by the user.",
        )
        response = await probe.arun(input="Reply with exactly WORKSPACE_COUNCIL_READY")
        print(json.dumps({"openrouter_model": str(response.content).strip()}, indent=2))

    if test_mcp:
        tools = build_workplace_tools(settings)
        async with tools:
            names = discovered_tool_names(tools)
            expected = set(READ_TOOL_NAMES + PUBLISH_MUTATION_TOOL_NAMES)
            expected_mail = set(MAIL_TOOL_NAMES)
            available = {name.removeprefix("ambiguous_") for name in names}
            print(
                json.dumps(
                    {
                        "ambiguous_mcp": "connected",
                        "tool_count": len(names),
                        "demo_tools": {
                            "available": sorted(expected & available),
                            "missing": sorted(expected - available),
                        },
                        "mail_tools": {
                            "available": sorted(expected_mail & available),
                            "missing": sorted(expected_mail - available),
                        },
                    },
                    indent=2,
                )
            )
    return 0


async def run_team(settings: Settings, prompt: str, *, commit: bool) -> int:
    reader_tools = build_reader_tools(settings)
    publisher_tools = build_publisher_tools(
        settings,
        allow_writes=commit,
        require_confirmation=False,
    )
    async with AsyncExitStack() as stack:
        await stack.enter_async_context(reader_tools)
        await stack.enter_async_context(publisher_tools)
        print(
            "Connected to Ambiguous with a document-only capability set: "
            f"{len(reader_tools.functions)} reader tools, "
            f"{len(publisher_tools.functions)} publisher tools."
        )
        team = build_team(
            settings,
            reader_tools,
            publisher_tools,
        )
        mode = "PUBLISHING IS APPROVED" if commit else "PREVIEW ONLY; DO NOT PUBLISH"
        await team.aprint_response(
            input=f"{mode}.\n\nUser request:\n{prompt}",
            stream=True,
            user_id="hackathon-demo",
            session_id=f"workspace-council-cli-{uuid4()}",
            markdown=True,
        )
    return 0


async def run_smoke_test(settings: Settings, prompt: str, *, commit: bool) -> int:
    """Run the Layer 1 single-agent proof with no web or CopilotKit dependency."""
    tools = build_demo_tools(settings, allow_writes=commit)
    async with tools:
        mode = "CREATE A NEW DOCUMENT" if commit else "READ ONLY; DO NOT CREATE"
        agent = Agent(
            id="ambiguous-layer-one",
            name="Ambiguous Layer 1",
            model=build_model(settings),
            tools=[tools],
            tool_call_limit=6,
            instructions=[
                "Use Ambiguous MCP as the only source and destination.",
                "For a recent-doc list, call list_documents once with only type='doc' and limit=3.",
                "Never invent cursor, fields, or notify arguments and never retry a successful call.",
                "Never overwrite a source document.",
                "When writes are approved, create one new clearly titled document and read it back by ID.",
                "Return exact document titles and IDs supplied by tools.",
            ],
            markdown=True,
            telemetry=False,
        )
        print(
            f"Layer 1 connected with {len(tools.functions)} document tools. "
            f"Mode: {mode}."
        )
        await agent.aprint_response(
            input=f"{mode}.\n\nTask:\n{prompt}",
            stream=True,
            markdown=True,
        )
    return 0


def parser() -> argparse.ArgumentParser:
    command = argparse.ArgumentParser(prog="workspace-council")
    subcommands = command.add_subparsers(dest="command", required=True)

    doctor_parser = subcommands.add_parser("doctor", help="Validate integrations")
    doctor_parser.add_argument("--model", action="store_true")
    doctor_parser.add_argument("--mcp", action="store_true")

    run_parser = subcommands.add_parser("run", help="Run the specialist team")
    run_parser.add_argument("prompt", help="The workplace outcome to produce")
    run_parser.add_argument(
        "--commit",
        action="store_true",
        help="Approve creation of a new Ambiguous artifact",
    )

    smoke_parser = subcommands.add_parser(
        "smoke",
        help="Run the Layer 1 single-agent Ambiguous proof",
    )
    smoke_parser.add_argument("prompt", help="The document task to perform")
    smoke_parser.add_argument(
        "--commit",
        action="store_true",
        help="Approve creation of one new Ambiguous document",
    )
    return command


def main() -> None:
    args = parser().parse_args()
    try:
        settings = Settings.from_env()
        if args.command == "doctor":
            code = asyncio.run(
                doctor(settings, test_model=args.model, test_mcp=args.mcp)
            )
        elif args.command == "run":
            code = asyncio.run(run_team(settings, args.prompt, commit=args.commit))
        else:
            code = asyncio.run(run_smoke_test(settings, args.prompt, commit=args.commit))
        raise SystemExit(code)
    except ConfigurationError as exc:
        raise SystemExit(f"Configuration error: {exc}") from exc


if __name__ == "__main__":
    main()
