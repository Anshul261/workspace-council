"use client";

import {
  CopilotSidebar,
  UseAgentUpdate,
  useAgent,
} from "@copilotkit/react-core/v2";
import { FormEvent, useEffect, useState } from "react";

import { AppNavigation } from "./app-navigation";
import { Checkpoint, CouncilStage, CouncilToolHost } from "./council-tools";

const specialists = [
  { mark: "01", name: "Workspace Reader", detail: "Finds the source record", tag: "MCP read", stage: "retrieval" },
  { mark: "02", name: "Web Researcher", detail: "Collects outside evidence", tag: "Exa", stage: "research" },
  { mark: "03", name: "Editorial Writer", detail: "Shapes the working draft", tag: "Draft", stage: "draft" },
  { mark: "04", name: "Quality Critic", detail: "Tests claims and clarity", tag: "Review", stage: "review" },
  { mark: "05", name: "Workspace Publisher", detail: "Creates and verifies output", tag: "Approval", stage: "publish" },
  { mark: "06", name: "Mail Operator", detail: "Finds, labels, and drafts mail", tag: "Draft only", stage: "mail" },
];

const starters = [
  "Read the latest project brief, research the market context, and draft a decision memo.",
  "Turn this workspace document into an executive update with risks, owners, and next actions.",
  "Research the claims in this document, critique the evidence, and propose a stronger version.",
];

const contract: { key: Checkpoint; label: string }[] = [
  { key: "source", label: "Source record retrieved" },
  { key: "evidence", label: "Evidence URLs preserved" },
  { key: "critic", label: "Critic verdict returned" },
  { key: "approval", label: "Human approval captured" },
  { key: "published", label: "Published record read back" },
];

const initialCheckpoints: Record<Checkpoint, boolean> = {
  source: false,
  evidence: false,
  critic: false,
  approval: false,
  published: false,
};

type HealthState = "checking" | "ready" | "unavailable";

export default function Home() {
  const [mission, setMission] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [health, setHealth] = useState<HealthState>("checking");
  const [error, setError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<CouncilStage>("idle");
  const [stageSummary, setStageSummary] = useState("Waiting for a mission brief.");
  const [activeSpecialist, setActiveSpecialist] = useState("Workspace Council");
  const [checkpoints, setCheckpoints] = useState(initialCheckpoints);
  const [missionSequence, setMissionSequence] = useState(0);
  const { agent, isReady } = useAgent({
    agentId: "default",
    updates: [
      UseAgentUpdate.OnMessagesChanged,
      UseAgentUpdate.OnRunStatusChanged,
      UseAgentUpdate.OnStateChanged,
    ],
    throttleMs: 120,
  });

  function markCheckpoint(checkpoint: Checkpoint) {
    setCheckpoints((current) =>
      current[checkpoint] ? current : { ...current, [checkpoint]: true },
    );
  }

  useEffect(() => {
    if (!isReady) return;

    const subscription = agent.subscribe({
      onRawEvent: ({ event }) => {
        if (!event.event || typeof event.event !== "object") return;
        const payload = event.event as Record<string, unknown>;
        const eventName = typeof payload.event === "string" ? payload.event : "";
        const agentId = typeof payload.agent_id === "string" ? payload.agent_id : "";

        const stages: Record<string, { stage: CouncilStage; name: string; summary: string }> = {
          "workspace-reader": {
            stage: "retrieval",
            name: "Workspace Reader",
            summary: "Retrieving permitted workspace context.",
          },
          "web-researcher": {
            stage: "research",
            name: "Web Researcher",
            summary: "Checking current external evidence with Exa.",
          },
          "editorial-writer": {
            stage: "draft",
            name: "Editorial Writer",
            summary: "Turning verified context into a decision-ready draft.",
          },
          "quality-critic": {
            stage: "review",
            name: "Quality Critic",
            summary: "Testing factual support, clarity, and actionability.",
          },
          "workspace-publisher": {
            stage: "publish",
            name: "Workspace Publisher",
            summary: "Preparing or verifying an approved workspace artifact.",
          },
          "mail-operator": {
            stage: "mail",
            name: "Mail Operator",
            summary: "Reading mail or preparing an approval-gated draft.",
          },
        };
        const specialist = stages[agentId];

        if (eventName === "RunStarted" && specialist) {
          setActiveStage(specialist.stage);
          setActiveSpecialist(specialist.name);
          setStageSummary(specialist.summary);
        }
        if (eventName === "RunContentCompleted" && agentId === "quality-critic") {
          setCheckpoints((current) => ({ ...current, critic: true }));
        }
      },
    });

    return () => subscription.unsubscribe();
  }, [agent, isReady]);

  useEffect(() => {
    let active = true;

    async function checkHealth() {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        if (active) setHealth(response.ok ? "ready" : "unavailable");
      } catch {
        if (active) setHealth("unavailable");
      }
    }

    void checkHealth();
    const interval = window.setInterval(checkHealth, 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  async function submitMission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = mission.trim();

    if (!prompt || !isReady || health !== "ready" || agent.isRunning) return;

    setError(null);
    setActiveStage("retrieval");
    setActiveSpecialist("Workspace Reader");
    setStageSummary("Locating the requested workspace source.");
    setCheckpoints(initialCheckpoints);
    setMissionSequence((current) => current + 1);
    setSidebarOpen(true);
    agent.addMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
    });

    try {
      await agent.runAgent();
      setMission("");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "The council run failed.");
    }
  }

  const runtimeReady = isReady && health === "ready";
  const sessionLabel = agent.isRunning
    ? "Council in session"
    : agent.messages.length > 0
      ? "Run ready for review"
      : runtimeReady
        ? "Ready for a brief"
        : "Checking connections";

  return (
    <>
      <CouncilToolHost key={missionSequence} onCheckpoint={markCheckpoint} />
      <main className="shell">
        <aside className="council" aria-label="Agent council">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">WC</span>
            <div>
              <p className="eyebrow">AgentOS / live team</p>
              <p className="brand-name">Workspace Council</p>
            </div>
          </div>

          <AppNavigation />

          <ol className="specialists">
            {specialists.map((specialist) => (
              <li
                className={`specialist ${
                  activeStage === specialist.stage ||
                  (specialist.stage === "publish" && activeStage === "approval")
                    ? "is-active"
                    : ""
                }`}
                key={specialist.mark}
              >
                <span className="agent-index">{specialist.mark}</span>
                <span className="agent-copy">
                  <strong>{specialist.name}</strong>
                  <small>{specialist.detail}</small>
                </span>
                <span className="agent-tag">{specialist.tag}</span>
              </li>
            ))}
          </ol>

          <div className={`connection connection-${health}`} aria-live="polite">
            <span className="status-dot" aria-hidden="true" />
            <div>
              <strong>Ambiguous MCP</strong>
              <small>
                {health === "ready"
                  ? "Document tools connected"
                  : health === "checking"
                    ? "Checking capability access"
                    : "Agent service unavailable"}
              </small>
            </div>
          </div>
        </aside>

        <section className="workspace">
          <header className="workspace-header">
            <div className="hero-copy">
              <p className="eyebrow">Research / write / review / approve / publish</p>
              <h1>Turn workspace context into finished work.</h1>
              <p className="hero-deck">
                Five specialists share one brief. Every external claim keeps its source,
                and every workspace write stops for your approval.
              </p>
            </div>
            <div className={`run-state ${agent.isRunning ? "is-running" : ""}`} aria-live="polite">
              <span>Current session</span>
              <strong>{sessionLabel}</strong>
              <small>{activeSpecialist} / {stageSummary}</small>
            </div>
          </header>

          {error ? (
            <div className="error-banner" role="alert">
              <strong>Run interrupted.</strong>
              <span>{error}</span>
              <button type="button" onClick={() => setSidebarOpen(true)}>Open transcript</button>
            </div>
          ) : null}

          <div className="mission-grid">
            <section className="brief-panel" aria-labelledby="brief-title">
              <div className="section-heading">
                <span className="section-number">A</span>
                <div>
                  <p className="eyebrow">Mission desk</p>
                  <h2 id="brief-title">What should the council deliver?</h2>
                </div>
              </div>

              <form className="mission-form" onSubmit={submitMission}>
                <label htmlFor="mission">Outcome and source</label>
                <textarea
                  id="mission"
                  value={mission}
                  onChange={(event) => setMission(event.target.value)}
                  placeholder="Example: Read the Q3 launch brief in Ambiguous, verify the market claims, and prepare an executive decision memo."
                  rows={5}
                />
                <div className="mission-actions">
                  <p>
                    Publishing creates a new document only after an approval checkpoint.
                  </p>
                  <button
                    className="primary-action"
                    type="submit"
                    disabled={!mission.trim() || !runtimeReady || agent.isRunning}
                  >
                    {agent.isRunning ? "Council working" : "Start council run"}
                    <span aria-hidden="true">↗</span>
                  </button>
                </div>
              </form>

              <div className="starter-block">
                <p className="eyebrow">Starter briefs</p>
                <ul className="starter-list">
                  {starters.map((starter, index) => (
                    <li key={starter}>
                      <button className="starter" type="button" onClick={() => setMission(starter)}>
                        <span>0{index + 1}</span>
                        <strong>{starter}</strong>
                        <b>Use</b>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <aside className="proof-panel" aria-labelledby="proof-title">
              <div className="section-heading compact">
                <span className="section-number">B</span>
                <div>
                  <p className="eyebrow">Proof, not promises</p>
                  <h2 id="proof-title">Completion contract</h2>
                </div>
              </div>
              <p className="proof-intro">
                A run is not complete until the transcript contains evidence for every checkpoint.
              </p>
              <ol className="proof-list">
                {contract.map((item, index) => (
                  <li className={checkpoints[item.key] ? "is-complete" : ""} key={item.key}>
                    <span>0{index + 1}</span>
                    <strong>{item.label}</strong>
                    <small>{checkpoints[item.key] ? "verified" : "required"}</small>
                  </li>
                ))}
              </ol>
              <div className="safety-note">
                <span aria-hidden="true">!</span>
                <p>
                  The reader has no write tools. The publisher can only create a new document,
                  then read it back for verification.
                </p>
              </div>
              <button className="transcript-action" type="button" onClick={() => setSidebarOpen(true)}>
                Open council transcript
                <span aria-hidden="true">→</span>
              </button>
            </aside>
          </div>
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
          welcomeMessageText: "Assign a mission from the desk, or start here with a workspace outcome.",
        }}
        onError={(event) => {
          if ("error" in event) setError(event.error.message);
        }}
      />
    </>
  );
}
