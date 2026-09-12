"use client";

import {
  CopilotSidebar,
  UseAgentUpdate,
  useAgent,
} from "@copilotkit/react-core/v2";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { AppNavigation } from "../app-navigation";
import { Checkpoint, CouncilToolHost } from "../council-tools";

type AgentStatus = "idle" | "working" | "waiting" | "completed" | "failed";
type LifecycleStage = "read" | "research" | "analyze" | "decide" | "execute" | "complete";
type EventCategory = "agents" | "tools" | "approvals" | "errors";
type FeedFilter = "all" | EventCategory;

type AgentDefinition = {
  id: string;
  name: string;
  mark: string;
  role: string;
  tools: string;
  position: string;
};

type AgentRuntime = AgentDefinition & {
  status: AgentStatus;
  activity: string;
  lastInput?: string;
  lastOutput?: string;
};

type FeedEvent = {
  id: string;
  category: EventCategory;
  source: string;
  message: string;
  time: number;
};

type EvidenceItem = {
  id: string;
  query: string;
  status: "checking" | "captured" | "failed";
  source?: string;
  excerpt?: string;
};

type ToolRuntime = {
  name: string;
  args: string;
  owner: string;
};

const agents: AgentDefinition[] = [
  {
    id: "workspace-reader",
    name: "Workspace Reader",
    mark: "WR",
    role: "Retrieves source material",
    tools: "Ambiguous MCP · read only",
    position: "node-reader",
  },
  {
    id: "web-researcher",
    name: "Web Researcher",
    mark: "RE",
    role: "Finds external evidence",
    tools: "Exa search + contents",
    position: "node-researcher",
  },
  {
    id: "editorial-writer",
    name: "Editorial Writer",
    mark: "EW",
    role: "Builds the working draft",
    tools: "Council context",
    position: "node-writer",
  },
  {
    id: "quality-critic",
    name: "Quality Critic",
    mark: "QC",
    role: "Challenges support and clarity",
    tools: "Independent model review",
    position: "node-critic",
  },
  {
    id: "workspace-publisher",
    name: "Workspace Publisher",
    mark: "WP",
    role: "Creates and verifies output",
    tools: "Ambiguous MCP · approval gated",
    position: "node-publisher",
  },
  {
    id: "mail-operator",
    name: "Mail Operator",
    mark: "MO",
    role: "Reads mail and creates drafts",
    tools: "Ambiguous Mail · draft only",
    position: "node-mail",
  },
];

const lifecycle: { id: LifecycleStage; label: string; detail: string }[] = [
  { id: "read", label: "Read", detail: "Workspace source" },
  { id: "research", label: "Research", detail: "External evidence" },
  { id: "analyze", label: "Analyze", detail: "Draft and critique" },
  { id: "decide", label: "Decide", detail: "Human approval" },
  { id: "execute", label: "Execute", detail: "Create and verify" },
  { id: "complete", label: "Complete", detail: "Return receipt" },
];

const emptyCheckpoints: Record<Checkpoint, boolean> = {
  source: false,
  evidence: false,
  critic: false,
  approval: false,
  published: false,
};

const agentStage: Record<string, LifecycleStage> = {
  "workspace-reader": "read",
  "web-researcher": "research",
  "editorial-writer": "analyze",
  "quality-critic": "analyze",
  "workspace-publisher": "execute",
  "mail-operator": "execute",
};

const stageActivity: Record<string, string> = {
  "workspace-reader": "Retrieving permitted workspace context",
  "web-researcher": "Checking current evidence with Exa",
  "editorial-writer": "Building a decision-ready draft",
  "quality-critic": "Testing support, clarity, and next actions",
  "workspace-publisher": "Preparing or verifying the approved artifact",
  "mail-operator": "Reading mail or preparing an approval-gated draft",
};

const toolOwners: Record<string, string> = {
  ambiguous_get_document: "workspace-reader",
  ambiguous_list_documents: "workspace-reader",
  ambiguous_search_workspace: "workspace-reader",
  search_exa: "web-researcher",
  get_contents: "web-researcher",
  ambiguous_create_document: "workspace-publisher",
  ambiguous_search_mail: "mail-operator",
  ambiguous_get_email: "mail-operator",
  ambiguous_list_mail_labels: "mail-operator",
  ambiguous_create_draft_email: "mail-operator",
  ambiguous_batch_modify_emails: "mail-operator",
};

const approvalTools = new Set([
  "ambiguous_create_document",
  "ambiguous_create_draft_email",
  "ambiguous_batch_modify_emails",
]);

function timeLabel(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

function elapsedLabel(start: number | null, end: number | null, now: number) {
  if (!start) return "00:00";
  const totalSeconds = Math.max(0, Math.floor(((end ?? now) - start) / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function truncate(value: string, length = 180) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > length ? `${normalized.slice(0, length - 1)}…` : normalized;
}

function readableToolName(name: string) {
  return name.replace(/^ambiguous_/, "Ambiguous / ").replaceAll("_", " ");
}

function firstUrl(value: string) {
  return value.match(/https?:\/\/[^\s\]})>,"']+/)?.[0];
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .filter(Boolean)
    .join(" ");
}

function rawSummary(payload: Record<string, unknown>) {
  for (const key of ["content", "result", "response", "message"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return truncate(value);
  }
  return "";
}

export default function CouncilPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [health, setHealth] = useState<"checking" | "ready" | "unavailable">("checking");
  const [healthDetail, setHealthDetail] = useState("Checking AgentOS and MCP capabilities");
  const [mission, setMission] = useState("");
  const [missionSequence, setMissionSequence] = useState(0);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState("workspace-reader");
  const [stage, setStage] = useState<LifecycleStage>("read");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [checkpoints, setCheckpoints] = useState(emptyCheckpoints);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [agentRuntime, setAgentRuntime] = useState<Record<string, Pick<AgentRuntime, "status" | "activity" | "lastInput" | "lastOutput">>>(
    () => Object.fromEntries(agents.map((agent) => [agent.id, { status: "idle", activity: "Awaiting a council run" }])),
  );
  const feedEnd = useRef<HTMLDivElement>(null);
  const eventCounter = useRef(0);
  const toolsRef = useRef<Record<string, ToolRuntime>>({});
  const { agent, isReady } = useAgent({
    agentId: "default",
    updates: [
      UseAgentUpdate.OnMessagesChanged,
      UseAgentUpdate.OnRunStatusChanged,
      UseAgentUpdate.OnStateChanged,
    ],
    throttleMs: 120,
  });

  function addEvent(category: EventCategory, source: string, message: string) {
    setEvents((current) => [
      ...current.slice(-119),
      {
        id: `${Date.now()}-${eventCounter.current++}`,
        category,
        source,
        message,
        time: Date.now(),
      },
    ]);
  }

  function updateAgent(
    id: string,
    update: Partial<Pick<AgentRuntime, "status" | "activity" | "lastInput" | "lastOutput">>,
  ) {
    if (!agents.some((item) => item.id === id)) return;
    setAgentRuntime((current) => ({
      ...current,
      [id]: { ...current[id], ...update },
    }));
  }

  function markCheckpoint(checkpoint: Checkpoint) {
    setCheckpoints((current) => ({ ...current, [checkpoint]: true }));
    if (checkpoint === "approval") setStage("execute");
  }

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;
    async function checkHealth() {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const body = (await response.json()) as {
          model?: { provider?: string; primary?: string };
          mcp?: Record<string, boolean>;
        };
        if (!active) return;
        setHealth(response.ok ? "ready" : "unavailable");
        if (response.ok) {
          const connected = Object.values(body.mcp ?? {}).filter(Boolean).length;
          const total = Object.keys(body.mcp ?? {}).length;
          setHealthDetail(`${body.model?.provider ?? "AgentOS"} · ${connected}/${total} MCP capability sets ready`);
        } else {
          setHealthDetail("Agent service unavailable");
        }
      } catch {
        if (active) {
          setHealth("unavailable");
          setHealthDetail("Agent service unavailable");
        }
      }
    }
    void checkHealth();
    const interval = window.setInterval(checkHealth, 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!isReady) return;

    const subscription = agent.subscribe({
      onRunStartedEvent: () => {
        const timestamp = Date.now();
        setStartedAt(timestamp);
        setFinishedAt(null);
        setStage("read");
        setCheckpoints(emptyCheckpoints);
        setEvents([]);
        setEvidence([]);
        toolsRef.current = {};
        setAgentRuntime(
          Object.fromEntries(agents.map((item) => [item.id, { status: "idle", activity: "Queued by Workspace Council" }])),
        );
        addEvent("agents", "Workspace Council", "Run accepted. Specialists are ready for delegation.");
      },
      onRunFinishedEvent: () => {
        setFinishedAt(Date.now());
        setStage("complete");
        setAgentRuntime((current) =>
          Object.fromEntries(
            Object.entries(current).map(([id, runtime]) => [
              id,
              runtime.status === "working" ? { ...runtime, status: "completed", activity: "Work returned to the council" } : runtime,
            ]),
          ),
        );
        addEvent("agents", "Workspace Council", "Run finished. The council returned its receipt to the transcript.");
      },
      onRunErrorEvent: ({ event }) => {
        setFinishedAt(Date.now());
        addEvent("errors", "Workspace Council", event.message || "The council run failed.");
      },
      onToolCallStartEvent: ({ event }) => {
        const owner = toolOwners[event.toolCallName] ?? "workspace-council";
        const ownerName = agents.find((item) => item.id === owner)?.name ?? "Workspace Council";
        const category: EventCategory = approvalTools.has(event.toolCallName) ? "approvals" : "tools";
        const toolRuntime = { name: event.toolCallName, args: "", owner };
        toolsRef.current[event.toolCallId] = toolRuntime;
        updateAgent(owner, {
          status: approvalTools.has(event.toolCallName) ? "waiting" : "working",
          activity: approvalTools.has(event.toolCallName)
            ? "Waiting for explicit human approval"
            : `Using ${readableToolName(event.toolCallName)}`,
        });
        if (approvalTools.has(event.toolCallName)) setStage("decide");
        addEvent(
          category,
          ownerName,
          approvalTools.has(event.toolCallName)
            ? `${readableToolName(event.toolCallName)} requires human approval.`
            : `Started ${readableToolName(event.toolCallName)}.`,
        );
        if (event.toolCallName === "search_exa" || event.toolCallName === "get_contents") {
          setEvidence((current) => [
            ...current,
            {
              id: event.toolCallId,
              query: event.toolCallName === "search_exa" ? "Preparing evidence query" : "Inspecting selected source",
              status: "checking",
            },
          ]);
        }
      },
      onToolCallArgsEvent: ({ event, partialToolCallArgs }) => {
        const serialized = JSON.stringify(partialToolCallArgs);
        if (toolsRef.current[event.toolCallId]) {
          toolsRef.current[event.toolCallId] = {
            ...toolsRef.current[event.toolCallId],
            args: serialized,
          };
        }
        setEvidence((current) => current.map((item) => {
          if (item.id !== event.toolCallId) return item;
          const query = typeof partialToolCallArgs.query === "string"
            ? partialToolCallArgs.query
            : Array.isArray(partialToolCallArgs.urls)
              ? String(partialToolCallArgs.urls[0] ?? item.query)
              : item.query;
          return { ...item, query };
        }));
      },
      onToolCallResultEvent: ({ event }) => {
        const runtime = toolsRef.current[event.toolCallId];
        const toolName = runtime?.name;
        const owner = runtime?.owner ?? (toolName ? toolOwners[toolName] : undefined);
        const ownerName = agents.find((item) => item.id === owner)?.name ?? "Workspace Council";
        const content = event.content || "Tool completed without a text result.";
        if (owner) {
          updateAgent(owner, {
            status: "working",
            activity: `${readableToolName(toolName ?? "tool")} completed`,
            lastOutput: truncate(content),
          });
        }
        addEvent("tools", ownerName, `${readableToolName(toolName ?? "tool")} completed.`);
        setEvidence((current) => current.map((item) => item.id === event.toolCallId
          ? {
              ...item,
              status: "captured",
              source: firstUrl(content) ?? firstUrl(runtime?.args ?? ""),
              excerpt: truncate(content, 240),
            }
          : item,
        ));
        if (toolName === "ambiguous_get_document") markCheckpoint("source");
        if (toolName === "search_exa" || toolName === "get_contents") markCheckpoint("evidence");
        if (toolName === "ambiguous_create_document") setStage("execute");
      },
      onRawEvent: ({ event }) => {
        if (!event.event || typeof event.event !== "object") return;
        const payload = event.event as Record<string, unknown>;
        const eventName = typeof payload.event === "string" ? payload.event : "";
        const agentId = typeof payload.agent_id === "string" ? payload.agent_id : "";
        const definition = agents.find((item) => item.id === agentId);
        if (!definition) return;
        const summary = rawSummary(payload);

        if (eventName === "RunStarted") {
          setStage(agentStage[agentId]);
          setSelectedAgent(agentId);
          updateAgent(agentId, {
            status: "working",
            activity: stageActivity[agentId],
            lastInput: summary || "Delegated by Workspace Council",
          });
          addEvent("agents", definition.name, stageActivity[agentId]);
        }
        if (eventName === "RunContentCompleted") {
          updateAgent(agentId, {
            status: "completed",
            activity: "Completed and returned work to the council",
            ...(summary ? { lastOutput: summary } : {}),
          });
          addEvent("agents", definition.name, summary || "Completed assigned work and returned it to the council.");
          if (agentId === "quality-critic") markCheckpoint("critic");
        }
        if (eventName === "RunError") {
          updateAgent(agentId, { status: "failed", activity: summary || "Specialist run failed" });
          addEvent("errors", definition.name, summary || "Specialist run failed.");
        }
      },
    });

    return () => subscription.unsubscribe();
  }, [agent, isReady]);

  useEffect(() => {
    if (autoScroll) feedEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [autoScroll, events]);

  const agentCards = useMemo<AgentRuntime[]>(
    () => agents.map((definition) => ({ ...definition, ...agentRuntime[definition.id] })),
    [agentRuntime],
  );
  const selected = agentCards.find((item) => item.id === selectedAgent) ?? agentCards[0];
  const filteredEvents = filter === "all" ? events : events.filter((event) => event.category === filter);
  const lastUserMessage = [...agent.messages]
    .reverse()
    .find((message) => message.role === "user");
  const lastAssistantMessage = [...agent.messages]
    .reverse()
    .find((message) => message.role === "assistant");
  const currentMission = truncate(messageText(lastUserMessage?.content), 110) || "No active mission. Start a brief below or from the Mission desk.";
  const finalOutput = truncate(messageText(lastAssistantMessage?.content), 320);
  const stageIndex = lifecycle.findIndex((item) => item.id === stage);
  const runtimeReady = isReady && health === "ready";
  const runStatus = agent.isRunning
    ? stage === "decide" ? "Awaiting approval" : "In progress"
    : agent.messages.length > 0 ? "Ready for review" : "Standby";

  async function submitMission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = mission.trim();
    if (!prompt || !runtimeReady || agent.isRunning) return;
    setMissionSequence((current) => current + 1);
    agent.addMessage({ id: crypto.randomUUID(), role: "user", content: prompt });
    setMission("");
    try {
      await agent.runAgent();
    } catch (runError) {
      addEvent("errors", "Workspace Council", runError instanceof Error ? runError.message : "The council run failed.");
    }
  }

  return (
    <>
      <CouncilToolHost key={missionSequence} onCheckpoint={markCheckpoint} />
      <main className="shell council-shell">
        <aside className="council council-rail" aria-label="Council navigation">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">WC</span>
            <div>
              <p className="eyebrow">AgentOS / live team</p>
              <p className="brand-name">Workspace Council</p>
            </div>
          </div>
          <AppNavigation />

          <div className="rail-run-summary">
            <p className="eyebrow">Observed mission</p>
            <strong>{currentMission}</strong>
            <small>The monitor shows only explicit operational events and outputs.</small>
          </div>

          <div className={`connection connection-${health}`} aria-live="polite">
            <span className="status-dot" aria-hidden="true" />
            <div>
              <strong>{health === "ready" ? "Live connection ready" : health === "checking" ? "Connecting" : "Connection unavailable"}</strong>
              <small>{healthDetail}</small>
            </div>
          </div>
        </aside>

        <section className="mission-control">
          <header className="control-header">
            <div>
              <p className="eyebrow">Council / live operations</p>
              <h1>Workspace Council mission control</h1>
              <p>{currentMission}</p>
            </div>
            <div className="control-status" aria-live="polite">
              <span className={agent.isRunning ? "live-pulse is-live" : "live-pulse"} />
              <div><small>Status</small><strong>{runStatus}</strong></div>
              <div><small>Started</small><strong>{startedAt ? timeLabel(startedAt) : "—"}</strong></div>
              <div><small>Elapsed</small><strong>{elapsedLabel(startedAt, finishedAt, now)}</strong></div>
              <button type="button" onClick={() => setSidebarOpen(true)}>Open transcript</button>
            </div>
          </header>

          <section className="lifecycle" aria-label="Council workflow progress">
            {lifecycle.map((item, index) => {
              const state = index < stageIndex ? "complete" : index === stageIndex ? "active" : "pending";
              return (
                <div className={`lifecycle-step is-${state}`} key={item.id}>
                  <span>{state === "complete" ? "✓" : index + 1}</span>
                  <div><strong>{item.label}</strong><small>{item.detail}</small></div>
                </div>
              );
            })}
          </section>

          <div className="control-grid">
            <section className="control-panel network-panel" aria-labelledby="network-title">
              <div className="panel-heading">
                <div><p className="eyebrow">Live agent network</p><h2 id="network-title">Council topology</h2></div>
                <span>{agentCards.filter((item) => item.status === "working").length} working</span>
              </div>
              <div className="agent-network">
                <svg aria-hidden="true" className="network-lines" viewBox="0 0 760 430" preserveAspectRatio="none">
                  <path d="M380 215 L115 82 M380 215 L380 62 M380 215 L645 82 M380 215 L115 350 M380 215 L380 370 M380 215 L645 350" />
                </svg>
                <div className={`council-core ${agent.isRunning ? "is-active" : ""}`}>
                  <span>WC</span><strong>Council</strong><small>{agent.isRunning ? "Coordinating" : "Standby"}</small>
                </div>
                {agentCards.map((item) => (
                  <button
                    className={`agent-node ${item.position} is-${item.status} ${selectedAgent === item.id ? "is-selected" : ""}`}
                    key={item.id}
                    onClick={() => setSelectedAgent(item.id)}
                    type="button"
                  >
                    <span>{item.mark}</span>
                    <strong>{item.name}</strong>
                    <small>{item.activity}</small>
                  </button>
                ))}
              </div>
              <div className="agent-inspector">
                <div className="inspector-title">
                  <span>{selected.mark}</span>
                  <div><strong>{selected.name}</strong><small>{selected.role}</small></div>
                  <b className={`status-chip status-${selected.status}`}>{selected.status}</b>
                </div>
                <dl>
                  <div><dt>Current task</dt><dd>{selected.activity}</dd></div>
                  <div><dt>Tools / boundary</dt><dd>{selected.tools}</dd></div>
                  <div><dt>Recent input</dt><dd>{selected.lastInput ?? "No input received in this view."}</dd></div>
                  <div><dt>Recent output</dt><dd>{selected.lastOutput ?? "No output returned in this view."}</dd></div>
                </dl>
              </div>
            </section>

            <section className="control-panel feed-panel" aria-labelledby="feed-title">
              <div className="panel-heading feed-heading">
                <div><p className="eyebrow">Safe operational stream</p><h2 id="feed-title">Council activity</h2></div>
                <button className={autoScroll ? "is-on" : ""} type="button" onClick={() => setAutoScroll((value) => !value)}>
                  Auto-scroll {autoScroll ? "on" : "off"}
                </button>
              </div>
              <div className="feed-filters" aria-label="Activity filters">
                {(["all", "agents", "tools", "approvals", "errors"] as FeedFilter[]).map((item) => (
                  <button
                    aria-pressed={filter === item}
                    className={filter === item ? "is-active" : ""}
                    key={item}
                    onClick={() => setFilter(item)}
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="activity-feed" aria-live="polite">
                {filteredEvents.length ? filteredEvents.map((item) => (
                  <article className={`feed-event event-${item.category}`} key={item.id}>
                    <span className="event-dot" />
                    <div><strong>{item.source}</strong><p>{item.message}</p></div>
                    <time>{timeLabel(item.time)}</time>
                  </article>
                )) : (
                  <div className="panel-empty">
                    <span>•••</span>
                    <strong>No operational events yet</strong>
                    <p>Start a council run to see specialist handoffs, tool calls, approvals, and failures here.</p>
                  </div>
                )}
                <div ref={feedEnd} />
              </div>
              <form className="control-composer" onSubmit={submitMission}>
                <label htmlFor="control-mission">New mission</label>
                <div>
                  <input
                    id="control-mission"
                    onChange={(event) => setMission(event.target.value)}
                    placeholder="Give the council an outcome and source…"
                    value={mission}
                  />
                  <button disabled={!mission.trim() || !runtimeReady || agent.isRunning} type="submit">
                    {agent.isRunning ? "Council working" : "Run council"}
                  </button>
                </div>
              </form>
            </section>

            <section className="control-panel evidence-panel" aria-labelledby="evidence-title">
              <div className="panel-heading">
                <div><p className="eyebrow">Evidence ledger</p><h2 id="evidence-title">External source trail</h2></div>
                <span>{evidence.filter((item) => item.status === "captured").length} captured</span>
              </div>
              <div className="evidence-ledger">
                {evidence.length ? evidence.map((item, index) => (
                  <article className={`evidence-item evidence-${item.status}`} key={item.id}>
                    <div className="evidence-index">E{String(index + 1).padStart(2, "0")}</div>
                    <div>
                      <small>{item.status === "checking" ? "Evidence check in progress" : "Tool result captured"}</small>
                      <strong>{item.query}</strong>
                      {item.excerpt ? <p>{item.excerpt}</p> : null}
                      {item.source ? <a href={item.source} rel="noreferrer" target="_blank">Open source ↗</a> : null}
                    </div>
                    <b>{item.status}</b>
                  </article>
                )) : (
                  <div className="panel-empty compact-empty">
                    <strong>No evidence calls captured</strong>
                    <p>Exa searches and selected source inspections will appear here with their returned URLs.</p>
                  </div>
                )}
              </div>
            </section>

            <section className="control-panel protocol-panel" aria-labelledby="protocol-title">
              <div className="panel-heading">
                <div><p className="eyebrow">Verified action protocol</p><h2 id="protocol-title">Human control & receipt</h2></div>
                <span>Guardrails active</span>
              </div>
              <div className="protocol-grid">
                <div className="approval-boundary">
                  <span>!</span>
                  <div>
                    <strong>Human in the loop</strong>
                    <p>Document creation, email drafting, and label changes pause at their server-enforced approval cards. Email sending is not available.</p>
                    <button type="button" onClick={() => setSidebarOpen(true)}>Review approval surface</button>
                  </div>
                </div>
                <ol className="receipt-list">
                  {([
                    ["source", "Source record retrieved"],
                    ["evidence", "Evidence URLs preserved"],
                    ["critic", "Critic verdict returned"],
                    ["approval", "Human approval captured"],
                    ["published", "Published record read back"],
                  ] as [Checkpoint, string][]).map(([key, label]) => (
                    <li className={checkpoints[key] ? "is-complete" : ""} key={key}>
                      <span>{checkpoints[key] ? "✓" : "○"}</span><strong>{label}</strong><small>{checkpoints[key] ? "verified" : "pending"}</small>
                    </li>
                  ))}
                </ol>
              </div>
              {finalOutput ? (
                <div className="decision-output"><small>Latest council output</small><p>{finalOutput}</p></div>
              ) : null}
            </section>
          </div>

          <footer className="control-footer">
            <p>Live data: CopilotKit → AG-UI → Agno Workspace Council</p>
            <Link href="/">Return to Mission desk →</Link>
          </footer>
        </section>
      </main>

      <CopilotSidebar
        agentId="default"
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        width="min(29rem, 100vw)"
        labels={{
          modalHeaderTitle: "Council transcript",
          chatInputPlaceholder: "Add context or give the council a direction...",
          welcomeMessageText: "Start a mission from Mission Control or review the council's live work here.",
        }}
      />
    </>
  );
}
