# Workspace Council

Workspace Council is an Agno-native team that reads an Ambiguous workspace, researches current context with Exa, writes an operational artifact, critiques it, publishes the approved result, and prepares related mail drafts without sending them.

The same `Team` powers the terminal safety demo and the CopilotKit interface through AgentOS and AG-UI.

## Team

- Workspace Reader: retrieves Ambiguous records and workspace context
- Web Researcher: searches Exa and preserves source URLs
- Editorial Writer: produces decision-ready documents
- Quality Critic: challenges evidence, clarity, and actionability
- Workspace Publisher: creates the approved Ambiguous artifact and reads it back
- Mail Operator: reads relevant mail, creates approval-gated drafts, and adds labels to explicit message IDs
- Workspace Council: Agno `TeamMode.coordinate` leader

## Native capabilities

- Agno Agent and Team delegation
- OpenRouter with a low-cost DeepSeek primary and ordered fallback
- Agno `ExaTools` with bounded search and content retrieval
- Agno `MCPTools` over authenticated Streamable HTTP
- Curated Ambiguous document and mail capability sets with server-enforced confirmations
- Agno SQLite session history and team interaction sharing
- Agno AgentOS with a native AG-UI team endpoint
- CopilotKit v2 with `HttpAgent` and `InMemoryAgentRunner`

## Setup

Copy `.env.example` to `.env` and supply the credentials. Existing lowercase `ambiguous_ai` is accepted temporarily, but `AMBIGUOUS_API_KEY` is preferred.

The default model route keeps costs low and falls back only when the primary model is unavailable:

```env
OPENROUTER_API_KEY=
OPENROUTER_MODEL=deepseek/deepseek-v4.1-flash
OPENROUTER_FALLBACK_MODEL=deepseek/deepseek-v4-flash-0731
EXA_API_KEY=
AMBIGUOUS_API_KEY=
```

Azure environment variables are not read by the application.

Install dependencies:

```bash
UV_CACHE_DIR=/tmp/workspace-council-uv uv sync
```

## Verify integrations

```bash
uv run workspace-council doctor
uv run workspace-council doctor --model
uv run workspace-council doctor --mcp
```

These commands never print credentials.

## Run the Layer 1 safety demo

This command uses one Agno agent and the document-only Ambiguous MCP toolkit. It does
not involve CopilotKit, AgentOS, or web research.

Read-only smoke test:

```bash
uv run workspace-council smoke \
  "List up to three recent documents with exact titles and record IDs"
```

Create-and-read-back smoke test. Use a disposable source and treat `--commit` as
explicit approval to create one new document:

```bash
uv run workspace-council smoke \
  "Read the project brief, summarize it as a short decision note, create a new document titled 'Council Smoke Test', and read it back" \
  --commit
```

Always use a disposable demo document. The source record is never intentionally overwritten.

## Run the full council in the terminal

Preview mode gives the reader three document-only tools and gives the publisher only
read-back access:

```bash
uv run workspace-council run \
  "Read the project brief in Ambiguous, research its key claims, and draft a decision memo"
```

`--commit` adds only `create_document` to the publisher. The reader never receives a
write tool.

## Run AgentOS

```bash
uv run python -m workspace_council.app
```

The native AG-UI team endpoint is `http://localhost:8000/agui`. The readiness endpoint
is `http://localhost:8000/healthz`. Do not enable Uvicorn reload while MCP tools are
attached.

## Run CopilotKit

```bash
cd web
npm install
npm run dev
```

The Next.js runtime proxies `/api/copilotkit` to `AGENT_URL`, which defaults to
`http://localhost:8000`. The UI starts with the mission desk visible; the CopilotKit
sidebar is the live transcript and follow-up surface. AG-UI raw events report
specialist activity, while named generative renderers show
Ambiguous retrieval, Exa evidence, and exact approval-gated document and mail payloads.

The Mail Operator intentionally has no send tool. Its only mutations are creating a
draft and adding labels to at most ten explicit email IDs, and both pause for approval.

The mission desk exposes `Stop run` while the council is active. Stopping cancels the
current AG-UI run and prevents further delegation; it does not roll back a side effect
that already completed.

## Clarification and review

Broad strategy requests do not immediately produce a generic artifact. The council can
perform one provider-neutral Exa orientation search, then asks up to three blocking
questions and ends the run. For an enterprise cloud data platform memo, those questions
cover cloud-provider strategy, scale/latency, and regulatory or data-residency needs.

The Quality Critic records an adversarial review with stable finding IDs, severities,
resolved findings, and required revision todos. Any blocking or material finding forces
`REVISE`; the writer must return a revision ledger and the critic must review again.
Publication is forbidden until the latest structured verdict is `APPROVED`.

Ambiguous workspace search uses the canonical application module IDs documented by the
live MCP schema, such as `docs`, `sheets`, and `slides`. Human aliases such as `doc`,
`sheet`, `documents`, or `channels` are not sent to the API. If workspace search fails,
the reader performs one bounded fallback through document listing and direct retrieval
instead of retrying broad searches.

## Architecture choice

Agno remains the orchestration framework for this build:

- It supplies native MCP tools for Layer 1 and a native AgentOS AG-UI endpoint for Layer 2.
- The same council implementation powers terminal and browser paths.
- LangGraph would add useful durable graph and interrupt primitives, but also adds a
  second orchestration abstraction that is not needed for this one-day demo.

The browser never receives the Ambiguous key. MCP terminates in Python; AG-UI connects
Python to CopilotKit; the CopilotKit runtime connects the browser to AG-UI.

## Demo completion contract

A published run is only successful when it has:

1. Retrieved a real source record.
2. Preserved external source URLs.
3. Resolved the critic's material objections.
4. Received explicit human approval.
5. Returned and reread the real Ambiguous record ID or link.

## Verified path

The current setup has been verified against the configured services:

- OpenRouter DeepSeek model readiness response
- Exa search against a live public source
- Authenticated Ambiguous MCP discovery
- Curated Ambiguous Mail discovery and capability boundaries
- One-call Layer 1 document retrieval
- Full council read-only delegation
- AgentOS `/healthz` and `/agui`
- CopilotKit runtime discovery and end-to-end `RUN_FINISHED`
- Production Next.js build and 1440px/375px rendered layouts

## Expansion path

Build new channels on the same AG-UI endpoint rather than introducing another agent
framework:

1. Add restricted Playwright MCP tools to the researcher for page inspection and screenshots.
2. Discover and curate the exact Ambiguous Mail tools; isolate read, draft, and send capabilities.
3. Adapt the OpenTag/CopilotKit Channels worker for Slack and render the same semantic events as Block Kit.
4. Require explicit approval for browser submissions, email sends, and workspace writes.
