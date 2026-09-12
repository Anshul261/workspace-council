"use client";

import {
  CopilotSidebar,
  UseAgentUpdate,
  useAgent,
} from "@copilotkit/react-core/v2";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppNavigation } from "../app-navigation";
import { Checkpoint, CouncilToolHost } from "../council-tools";

type AgentStatus = "idle" | "working" | "waiting" | "completed" | "failed" | "cancelled";
type LifecycleStage = "planning" | "retrieval" | "research" | "draft" | "review" | "action";
type LifecycleStatus = "pending" | "active" | "completed" | "skipped" | "waiting" | "failed" | "cancelled";
type RunOutcome = "standby" | "running" | "clarification" | "preview" | "completed" | "failed" | "cancelled";
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

type HistoryRun = {
  run_id: string;
  status: string;
  created_at: number;
  mission: string;
  summary: string;
  duration?: number;
  specialist_runs: number;
};

type HistoryDetail = {
  run_id: string;
  status: string;
  created_at: number;
  mission: string;
  final_summary: string;
  duration?: number;
  conversation: Array<{
    role: "user" | "assistant";
    content: string;
    created_at?: number;
  }>;
  specialists: Array<{
    agent_id: string;
    agent_name: string;
    status: string;
    created_at: number;
    summary: string;
  }>;
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
  { id: "planning", label: "Plan", detail: "Scope and clarify" },
  { id: "retrieval", label: "Read", detail: "Workspace source" },
  { id: "research", label: "Research", detail: "External evidence" },
  { id: "draft", label: "Draft", detail: "Build the artifact" },
  { id: "review", label: "Review", detail: "Adversarial critique" },
  { id: "action", label: "Act", detail: "Approve and verify" },
];

const emptyLifecycle = (): Record<LifecycleStage, LifecycleStatus> => ({
  planning: "pending",
  retrieval: "pending",
  research: "pending",
  draft: "pending",
  review: "pending",
  action: "pending",
});

const emptyCheckpoints: Record<Checkpoint, boolean> = {
  source: false,
  evidence: false,
  critic: false,
  approval: false,
  published: false,
};

const agentStage: Record<string, LifecycleStage> = {
  "workspace-reader": "retrieval",
  "web-researcher": "research",
  "editorial-writer": "draft",
  "quality-critic": "review",
  "workspace-publisher": "action",
  "mail-operator": "action",
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
  record_critic_review: "quality-critic",
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

function durationLabel(duration?: number) {
  if (!duration) return "duration unavailable";
  const totalSeconds = Math.max(0, Math.round(duration));
  const minutes = Math.floor(totalSeconds / 60);
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

function isToolError(value: string) {
  return value.includes("Error from MCP tool") ||
    value.includes("An error occurred while executing the tool") ||
    value.startsWith("Error:");
}

function criticVerdict(value: string): "APPROVED" | "REVISE" | null {
  try {
    const parsed = JSON.parse(value) as {
      verdict?: string;
      blocking_findings?: unknown[];
      material_findings?: unknown[];
    };
    if (
      parsed.verdict === "APPROVED" &&
      parsed.blocking_findings?.length === 0 &&
      parsed.material_findings?.length === 0
    ) return "APPROVED";
    if (parsed.verdict === "REVISE" || parsed.blocking_findings?.length || parsed.material_findings?.length) {
      return "REVISE";
    }
  } catch {
    return null;
  }
  return null;
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
  const [lifecycleState, setLifecycleState] = useState(emptyLifecycle);
  const [runOutcome, setRunOutcome] = useState<RunOutcome>("standby");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [checkpoints, setCheckpoints] = useState(emptyCheckpoints);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [coordinatorActivity, setCoordinatorActivity] = useState("Waiting for a mission brief.");
  const [history, setHistory] = useState<HistoryRun[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<HistoryDetail | null>(null);
  const [historyLoading, setHistoryLoading] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [agentRuntime, setAgentRuntime] = useState<Record<string, Pick<AgentRuntime, "status" | "activity" | "lastInput" | "lastOutput">>>(
    () => Object.fromEntries(agents.map((agent) => [agent.id, { status: "idle", activity: "Awaiting a council run" }])),
  );
  const feedEnd = useRef<HTMLDivElement>(null);
  const eventCounter = useRef(0);
  const toolsRef = useRef<Record<string, ToolRuntime>>({});
  const coordinatorMessageIdsRef = useRef(new Set<string>());
  const agentsSeenRef = useRef(new Set<string>());
  const stopRequested = useRef(false);
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

  const setLifecycleStatus = useCallback((stage: LifecycleStage, status: LifecycleStatus) => {
    setLifecycleState((current) => current[stage] === status ? current : { ...current, [stage]: status });
  }, []);

  const markCheckpoint = useCallback((checkpoint: Checkpoint) => {
    setCheckpoints((current) => current[checkpoint] ? current : { ...current, [checkpoint]: true });
    if (checkpoint === "source") setLifecycleStatus("retrieval", "completed");
    if (checkpoint === "evidence") setLifecycleStatus("research", "completed");
    if (checkpoint === "critic") {
      setLifecycleStatus("review", "completed");
      setRunOutcome("running");
    }
    if (checkpoint === "approval") setLifecycleStatus("action", "active");
    if (checkpoint === "published") setLifecycleStatus("action", "completed");
  }, [setLifecycleStatus]);

  const refreshHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/history", { cache: "no-store" });
      const body = (await response.json()) as { runs?: HistoryRun[] };
      if (response.ok) setHistory(body.runs ?? []);
    } catch {
      // Mission history is supporting context; live operation remains available.
    }
  }, []);

  const openHistory = useCallback(async (runId: string) => {
    setHistoryLoading(runId);
    setHistoryError(null);
    try {
      const response = await fetch(`/api/history/${encodeURIComponent(runId)}`, { cache: "no-store" });
      const body = (await response.json()) as HistoryDetail | { detail?: string };
      if (!response.ok || !("run_id" in body)) {
        throw new Error("detail" in body && body.detail ? body.detail : "Mission history unavailable");
      }
      setSelectedHistory(body);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Mission history unavailable");
    } finally {
      setHistoryLoading(null);
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refreshHistory(), 0);
    const interval = window.setInterval(refreshHistory, 20_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [refreshHistory]);

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
        stopRequested.current = false;
        agentsSeenRef.current = new Set();
        setStartedAt(timestamp);
        setFinishedAt(null);
        setRunOutcome("running");
        setCoordinatorActivity("Assessing the brief and choosing the next specialist handoff.");
        setLifecycleState({ ...emptyLifecycle(), planning: "active" });
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
        if (stopRequested.current) return;
        setFinishedAt(Date.now());
        setLifecycleState((current) => {
          const next = { ...current };
          for (const stage of lifecycle) {
            if (next[stage.id] === "pending") next[stage.id] = "skipped";
            if (next[stage.id] === "active") next[stage.id] = "completed";
          }
          return next;
        });
        setRunOutcome((current) => {
          if (current === "preview") return current;
          const seen = agentsSeenRef.current;
          const clarificationOnly =
            !seen.has("workspace-reader") &&
            !seen.has("editorial-writer") &&
            !seen.has("quality-critic") &&
            !seen.has("workspace-publisher") &&
            !seen.has("mail-operator");
          if (clarificationOnly) return "clarification";
          return "completed";
        });
        setCoordinatorActivity("Run finished. Review the receipt, evidence, and approval state below.");
        void refreshHistory();
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
        if (stopRequested.current) return;
        setFinishedAt(Date.now());
        setRunOutcome("failed");
        setCoordinatorActivity(event.message || "The council run failed before completion.");
        setLifecycleState((current) => Object.fromEntries(
          Object.entries(current).map(([key, status]) => [key, status === "active" ? "failed" : status]),
        ) as Record<LifecycleStage, LifecycleStatus>);
        addEvent("errors", "Workspace Council", event.message || "The council run failed.");
      },
      onToolCallStartEvent: ({ event }) => {
        const owner = toolOwners[event.toolCallName] ?? "workspace-council";
        const ownerName = agents.find((item) => item.id === owner)?.name ?? "Workspace Council";
        const category: EventCategory = approvalTools.has(event.toolCallName) ? "approvals" : "tools";
        const toolRuntime = { name: event.toolCallName, args: "", owner };
        toolsRef.current[event.toolCallId] = toolRuntime;
        setCoordinatorActivity(
          approvalTools.has(event.toolCallName)
            ? `A proposed ${readableToolName(event.toolCallName)} action is waiting for your approval.`
            : `${ownerName} is using ${readableToolName(event.toolCallName)}.`,
        );
        if (event.toolCallName === "record_critic_review") setLifecycleStatus("review", "active");
        if (event.toolCallName === "search_exa" || event.toolCallName === "get_contents") {
          setLifecycleStatus("research", "active");
        }
        if (event.toolCallName.startsWith("ambiguous_") && owner === "workspace-reader") {
          setLifecycleStatus("retrieval", "active");
        }
        if (approvalTools.has(event.toolCallName)) setLifecycleStatus("action", "waiting");
        updateAgent(owner, {
          status: approvalTools.has(event.toolCallName) ? "waiting" : "working",
          activity: approvalTools.has(event.toolCallName)
            ? "Waiting for explicit human approval"
            : `Using ${readableToolName(event.toolCallName)}`,
        });
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
        const failed = isToolError(content);
        setCoordinatorActivity(
          failed
            ? `${ownerName} reported a tool failure; the council is evaluating a bounded recovery.`
            : `${ownerName} returned ${readableToolName(toolName ?? "tool")} results to the coordinator.`,
        );
        if (owner) {
          updateAgent(owner, {
            status: failed ? "failed" : "working",
            activity: failed
              ? `${readableToolName(toolName ?? "tool")} failed`
              : `${readableToolName(toolName ?? "tool")} completed`,
            lastOutput: truncate(content),
          });
        }
        addEvent(failed ? "errors" : "tools", ownerName, `${readableToolName(toolName ?? "tool")} ${failed ? "failed" : "completed"}.`);
        setEvidence((current) => current.map((item) => item.id === event.toolCallId
          ? {
              ...item,
              status: failed ? "failed" : "captured",
              source: firstUrl(content) ?? firstUrl(runtime?.args ?? ""),
              excerpt: truncate(content, 240),
            }
          : item,
        ));
        if (failed) {
          const failedStage = owner ? agentStage[owner] : undefined;
          if (failedStage) setLifecycleStatus(failedStage, "failed");
          return;
        }
        if (toolName === "ambiguous_get_document") markCheckpoint("source");
        if ((toolName === "search_exa" || toolName === "get_contents") && (firstUrl(content) || firstUrl(runtime?.args ?? ""))) {
          markCheckpoint("evidence");
        }
        if (toolName === "record_critic_review") {
          const verdict = criticVerdict(content);
          if (verdict === "APPROVED") {
            markCheckpoint("critic");
            addEvent("agents", "Quality Critic", "Adversarial review approved with no open blocking or material findings.");
          } else if (verdict === "REVISE") {
            setLifecycleStatus("review", "waiting");
            setRunOutcome("preview");
            addEvent("agents", "Quality Critic", "Revision required. Open findings returned to the writer.");
          }
        }
        if (toolName === "ambiguous_create_document") setLifecycleStatus("action", "active");
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
          agentsSeenRef.current.add(agentId);
          setLifecycleStatus("planning", "completed");
          setLifecycleStatus(agentStage[agentId], "active");
          setSelectedAgent(agentId);
          setCoordinatorActivity(`Delegated to ${definition.name}: ${stageActivity[agentId]}.`);
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
          if (agentId === "editorial-writer") setLifecycleStatus("draft", "completed");
        }
        if (eventName === "RunError") {
          updateAgent(agentId, { status: "failed", activity: summary || "Specialist run failed" });
          setLifecycleStatus(agentStage[agentId], "failed");
          addEvent("errors", definition.name, summary || "Specialist run failed.");
        }
      },
      onTextMessageStartEvent: ({ event }) => {
        if (event.role === "assistant" && event.subagentRunId === undefined) {
          coordinatorMessageIdsRef.current.add(event.messageId);
        }
      },
      onTextMessageContentEvent: ({ event, textMessageBuffer }) => {
        if (!coordinatorMessageIdsRef.current.has(event.messageId)) return;
        setCoordinatorActivity(truncate(textMessageBuffer + event.delta, 360));
      },
      onTextMessageEndEvent: ({ event, textMessageBuffer }) => {
        if (!coordinatorMessageIdsRef.current.has(event.messageId)) return;
        coordinatorMessageIdsRef.current.delete(event.messageId);
        const summary = truncate(textMessageBuffer, 360);
        if (summary) {
          setCoordinatorActivity(summary);
          addEvent("agents", "Workspace Council", summary);
        }
      },
    });

    return () => subscription.unsubscribe();
  }, [agent, isReady, markCheckpoint, refreshHistory, setLifecycleStatus]);

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
  const runtimeReady = isReady && health === "ready";
  const runStatus = ({
    standby: "Standby",
    running: Object.values(lifecycleState).includes("waiting") ? "Awaiting input" : "In progress",
    clarification: "Clarification requested",
    preview: "Preview, review open",
    completed: "Ready for review",
    failed: "Run interrupted",
    cancelled: "Stopped by user",
  } satisfies Record<RunOutcome, string>)[runOutcome];

  async function submitMission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = mission.trim();
    if (!prompt || !runtimeReady || agent.isRunning) return;
    stopRequested.current = false;
    setMissionSequence((current) => current + 1);
    agent.addMessage({ id: crypto.randomUUID(), role: "user", content: prompt });
    setMission("");
    try {
      await agent.runAgent();
    } catch (runError) {
      if (stopRequested.current) return;
      addEvent("errors", "Workspace Council", runError instanceof Error ? runError.message : "The council run failed.");
    }
  }

  function stopMission() {
    if (!agent.isRunning) return;
    stopRequested.current = true;
    agent.abortRun();
    setFinishedAt(Date.now());
    setRunOutcome("cancelled");
    setCoordinatorActivity("Run stopped by the user. Completed side effects were not rolled back.");
    setLifecycleState((current) => Object.fromEntries(
      Object.entries(current).map(([key, status]) => [key, status === "active" || status === "waiting" ? "cancelled" : status]),
    ) as Record<LifecycleStage, LifecycleStatus>);
    setAgentRuntime((current) => Object.fromEntries(
      Object.entries(current).map(([id, runtime]) => [
        id,
        runtime.status === "working" || runtime.status === "waiting"
          ? { ...runtime, status: "cancelled", activity: "Stopped by the user" }
          : runtime,
      ]),
    ));
    addEvent("agents", "Workspace Council", "Run stopped by the user. Completed side effects were not rolled back.");
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
              <button
                aria-expanded={sidebarOpen}
                type="button"
                onClick={() => setSidebarOpen((open) => !open)}
              >
                {sidebarOpen ? "Collapse transcript" : "Open transcript"}
              </button>
            </div>
          </header>

          <section className="lifecycle" aria-label="Council workflow progress">
            {lifecycle.map((item, index) => {
              const state = lifecycleState[item.id];
              const symbol = state === "completed" ? "✓" : state === "skipped" ? "−" : state === "failed" ? "!" : state === "cancelled" ? "×" : index + 1;
              return (
                <div className={`lifecycle-step is-${state}`} key={item.id}>
                  <span>{symbol}</span>
                  <div><strong>{item.label}</strong><small>{item.detail}</small></div>
                </div>
              );
            })}
          </section>

          <section className="coordinator-brief" aria-live="polite">
            <div>
              <span className={agent.isRunning ? "brief-signal is-live" : "brief-signal"} />
              <p className="eyebrow">Coordinator / live brief</p>
            </div>
            <p>{coordinatorActivity}</p>
            <small>Visible operational summaries only. Private model reasoning is not exposed.</small>
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
                  {agent.isRunning ? (
                    <button className="control-stop" type="button" onClick={stopMission}>Stop run</button>
                  ) : (
                    <button disabled={!mission.trim() || !runtimeReady} type="submit">Run council</button>
                  )}
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
                      <small>{item.status === "checking" ? "Evidence check in progress" : item.status === "failed" ? "Evidence call failed" : "Tool result captured"}</small>
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
                    ["critic", "Adversarial review approved"],
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

            <section className="control-panel archive-panel" aria-labelledby="archive-title">
              <div className="panel-heading">
                <div><p className="eyebrow">Mission archive</p><h2 id="archive-title">Recent council operations</h2></div>
                <span>{history.length} records</span>
              </div>
              <div className="mission-archive">
                {history.length ? history.map((run) => (
                  <button
                    aria-pressed={selectedHistory?.run_id === run.run_id}
                    className={`mission-record ${selectedHistory?.run_id === run.run_id ? "is-selected" : ""}`}
                    key={run.run_id}
                    onClick={() => void openHistory(run.run_id)}
                    type="button"
                  >
                    <div className="mission-record-meta">
                      <time>{timeLabel(run.created_at * 1000)}</time>
                      <b className={`archive-status status-${run.status.toLowerCase()}`}>{run.status}</b>
                    </div>
                    <strong>{run.mission || "Council mission"}</strong>
                    <p>{run.summary || "No final receipt was persisted for this operation."}</p>
                    <small>
                      {historyLoading === run.run_id ? "Opening report..." : `${run.specialist_runs} specialist runs · ${durationLabel(run.duration)} · Open report`}
                    </small>
                  </button>
                )) : (
                  <div className="panel-empty compact-empty">
                    <strong>No persisted missions yet</strong>
                    <p>Completed council operations will appear here as run records, not chat threads.</p>
                  </div>
                )}
              </div>
              {historyError ? <div className="archive-error" role="alert">{historyError}</div> : null}
              {selectedHistory ? (
                <section className="after-action-report" aria-labelledby="after-action-title">
                  <header>
                    <div>
                      <p className="eyebrow">After-action report / {selectedHistory.status}</p>
                      <h3 id="after-action-title">{selectedHistory.mission || "Council mission"}</h3>
                    </div>
                    <button type="button" onClick={() => setSelectedHistory(null)}>Close report</button>
                  </header>
                  <div className="report-metrics">
                    <span>{timeLabel(selectedHistory.created_at * 1000)}</span>
                    <span>{durationLabel(selectedHistory.duration)}</span>
                    <span>{selectedHistory.specialists.length} specialist runs</span>
                  </div>
                  <div className="report-columns">
                    <section aria-labelledby="conversation-title">
                      <h4 id="conversation-title">Coordinator transcript</h4>
                      <ol className="mission-transcript">
                        {selectedHistory.conversation.length ? selectedHistory.conversation.map((entry, index) => (
                          <li className={`transcript-entry is-${entry.role}`} key={`${entry.role}-${index}`}>
                            <span>{entry.role === "user" ? "Operator" : "Council"}</span>
                            <p>{entry.content}</p>
                          </li>
                        )) : (
                          <li className="transcript-entry is-assistant">
                            <span>Council receipt</span>
                            <p>{selectedHistory.final_summary || "No coordinator transcript was persisted."}</p>
                          </li>
                        )}
                      </ol>
                    </section>
                    <section aria-labelledby="specialist-report-title">
                      <h4 id="specialist-report-title">Specialist handoffs</h4>
                      <ol className="specialist-report">
                        {selectedHistory.specialists.length ? selectedHistory.specialists.map((specialist) => (
                          <li key={`${specialist.agent_id}-${specialist.created_at}`}>
                            <div>
                              <strong>{specialist.agent_name}</strong>
                              <b className={`archive-status status-${specialist.status.toLowerCase()}`}>{specialist.status}</b>
                            </div>
                            <p>{specialist.summary || "Completed without a persisted text summary."}</p>
                          </li>
                        )) : (
                          <li><p>No specialist delegation was required for this run.</p></li>
                        )}
                      </ol>
                    </section>
                  </div>
                </section>
              ) : null}
            </section>
          </div>

          <footer className="control-footer">
            <p>Live data: CopilotKit → AG-UI → Agno Workspace Council</p>
            <Link href="/">Return to Mission desk →</Link>
          </footer>
        </section>
      </main>

      {!sidebarOpen ? (
        <button className="transcript-dock-toggle" type="button" onClick={() => setSidebarOpen(true)}>
          <span>Transcript</span>
          <small>Expand</small>
        </button>
      ) : null}

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
        onError={(event) => {
          if ("error" in event && !stopRequested.current) {
            setRunOutcome("failed");
            addEvent("errors", "Workspace Council", event.error.message);
          }
        }}
      />
    </>
  );
}
