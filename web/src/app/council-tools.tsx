"use client";

import {
  useDefaultRenderTool,
  useHumanInTheLoop,
  useRenderTool,
} from "@copilotkit/react-core/v2";
import { useEffect, useRef } from "react";
import { z } from "zod";

export type CouncilStage =
  | "idle"
  | "planning"
  | "clarification"
  | "retrieval"
  | "research"
  | "draft"
  | "review"
  | "approval"
  | "publish"
  | "mail"
  | "cancelled";

export type Checkpoint =
  | "source"
  | "evidence"
  | "critic"
  | "approval"
  | "published";

type ToolHostProps = {
  onCheckpoint: (checkpoint: Checkpoint) => void;
};

const createDocumentSchema = z.object({
  type: z.literal("doc"),
  title: z.string(),
  content: z.string(),
});

const createDraftSchema = z.object({
  to: z.array(z.string()),
  subject: z.string(),
  body_markdown: z.string(),
  labels: z.array(z.string()).optional(),
});

const labelEmailSchema = z.object({
  ids: z.array(z.string()),
  add_labels: z.array(z.string()),
});

const criticReviewSchema = z.object({
  verdict: z.enum(["APPROVED", "REVISE"]),
  blocking_findings: z.array(z.string()).optional(),
  material_findings: z.array(z.string()).optional(),
  minor_findings: z.array(z.string()).optional(),
  resolved_findings: z.array(z.string()).optional(),
  required_revisions: z.array(z.string()).optional(),
});

function shortResult(result: string | undefined) {
  if (!result) return "Waiting for a verified result";
  return result.length > 280 ? `${result.slice(0, 277)}...` : result;
}

function isToolError(result: string | undefined) {
  return Boolean(
    result &&
      (result.includes("Error from MCP tool") ||
        result.includes("An error occurred while executing the tool") ||
        result.startsWith("Error:")),
  );
}

function FindingList({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="finding-group">
      <strong>{title}</strong>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function CompletionSignal({
  status,
  checkpoint,
  onCheckpoint,
  enabled = true,
}: {
  status: string;
  checkpoint: Checkpoint;
  onCheckpoint: (checkpoint: Checkpoint) => void;
  enabled?: boolean;
}) {
  useEffect(() => {
    if (enabled && status === "complete") onCheckpoint(checkpoint);
  }, [checkpoint, enabled, onCheckpoint, status]);
  return null;
}

export function CouncilToolHost({ onCheckpoint }: ToolHostProps) {
  const documentWriteApproved = useRef(false);

  useRenderTool({
    name: "ambiguous_get_document",
    parameters: z.object({ id: z.string() }),
    render: ({ status, parameters, result }) => (
      <article className={`generative-card source-card generative-card-${status}`}>
        <CompletionSignal
          status={status}
          checkpoint="source"
          onCheckpoint={onCheckpoint}
          enabled={!isToolError(result)}
        />
        <CompletionSignal
          status={status}
          checkpoint="published"
          onCheckpoint={onCheckpoint}
          enabled={documentWriteApproved.current}
        />
        <p className="generative-label">Ambiguous / source record</p>
        <strong>{status === "complete" ? "Workspace record retrieved" : "Retrieving workspace record"}</strong>
        <code>{parameters.id ?? "Resolving record ID..."}</code>
        {status === "complete" ? <p>{shortResult(result)}</p> : null}
      </article>
    ),
  });

  useRenderTool({
    name: "ambiguous_list_documents",
    parameters: z.object({ type: z.string(), limit: z.number() }),
    render: ({ status, parameters, result }) => (
      <article className={`generative-card source-card generative-card-${status}`}>
        <p className="generative-label">Ambiguous / document index</p>
        <strong>{status === "complete" ? "Candidate records found" : "Scanning workspace documents"}</strong>
        <small>{parameters.limit ?? 3} {parameters.type ?? "doc"} records requested</small>
        {status === "complete" ? <p>{shortResult(result)}</p> : null}
      </article>
    ),
  });

  useRenderTool({
    name: "ambiguous_search_workspace",
    parameters: z.object({
      query: z.string(),
      modules: z.array(z.string()).optional(),
      limit: z.number(),
    }),
    render: ({ status, parameters, result }) => (
      <article className={`generative-card source-card ${isToolError(result) ? "generative-card-error" : ""} generative-card-${status}`}>
        <p className="generative-label">Ambiguous / workspace search</p>
        <strong>{parameters.query ?? "Preparing workspace query"}</strong>
        <small>{parameters.modules?.join(", ") || "All workspace modules"}</small>
        {status === "complete" ? (
          <p>{isToolError(result) ? "Workspace search failed; the reader will use document listing and direct retrieval instead." : shortResult(result)}</p>
        ) : <small>Searching permitted modules</small>}
      </article>
    ),
  });

  useRenderTool({
    name: "search_exa",
    parameters: z.object({ query: z.string(), num_results: z.number().optional() }),
    render: ({ status, parameters, result }) => (
      <article className={`generative-card evidence-card generative-card-${status}`}>
        <CompletionSignal status={status} checkpoint="evidence" onCheckpoint={onCheckpoint} />
        <p className="generative-label">Exa / external evidence</p>
        <strong>{parameters.query ?? "Preparing evidence query"}</strong>
        {status === "complete" ? <p>{shortResult(result)}</p> : <small>Searching current sources</small>}
      </article>
    ),
  });

  useRenderTool({
    name: "get_contents",
    parameters: z.object({ urls: z.array(z.string()) }),
    render: ({ status, parameters, result }) => (
      <article className={`generative-card evidence-card generative-card-${status}`}>
        <CompletionSignal status={status} checkpoint="evidence" onCheckpoint={onCheckpoint} />
        <p className="generative-label">Exa / source inspection</p>
        <strong>{status === "complete" ? "Source content captured" : "Inspecting selected source"}</strong>
        <small>{parameters.urls?.[0] ?? "Waiting for source URL"}</small>
        {status === "complete" ? <p>{shortResult(result)}</p> : null}
      </article>
    ),
  });

  useRenderTool({
    name: "record_critic_review",
    parameters: criticReviewSchema,
    render: ({ status, parameters }) => {
      const blockingFindings = parameters.blocking_findings ?? [];
      const materialFindings = parameters.material_findings ?? [];
      const approved =
        parameters.verdict === "APPROVED" &&
        blockingFindings.length === 0 &&
        materialFindings.length === 0;
      return (
        <article className={`generative-card critic-card ${approved ? "critic-approved" : "critic-revise"} generative-card-${status}`}>
          <CompletionSignal
            status={status}
            checkpoint="critic"
            onCheckpoint={onCheckpoint}
            enabled={approved}
          />
          <p className="generative-label">Adversarial review / {approved ? "APPROVED" : "REVISE"}</p>
          <strong>{approved ? "Draft survived review" : "Revision required"}</strong>
          <FindingList title="Blocking" items={blockingFindings} />
          <FindingList title="Material" items={materialFindings} />
          <FindingList title="Minor" items={parameters.minor_findings} />
          <FindingList title="Resolved" items={parameters.resolved_findings} />
          <FindingList title="Revision todos" items={parameters.required_revisions} />
        </article>
      );
    },
  });

  useRenderTool({
    name: "ambiguous_search_mail",
    parameters: z.object({
      q: z.string(),
      limit: z.number(),
      detail: z.enum(["full", "headers", "minimal"]),
    }),
    render: ({ status, parameters, result }) => (
      <article className={`generative-card mail-card generative-card-${status}`}>
        <p className="generative-label">Ambiguous Mail / search</p>
        <strong>{parameters.q ?? "Preparing mail query"}</strong>
        {status === "complete" ? <p>{shortResult(result)}</p> : <small>Read-only mailbox search</small>}
      </article>
    ),
  });

  useRenderTool({
    name: "ambiguous_get_email",
    parameters: z.object({
      id: z.string(),
      detail: z.enum(["full", "headers", "minimal"]),
    }),
    render: ({ status, parameters, result }) => (
      <article className={`generative-card mail-card generative-card-${status}`}>
        <p className="generative-label">Ambiguous Mail / message</p>
        <strong>{status === "complete" ? "Email context retrieved" : "Retrieving email context"}</strong>
        <code>{parameters.id ?? "Resolving message ID"}</code>
        {status === "complete" ? <p>{shortResult(result)}</p> : null}
      </article>
    ),
  });

  useHumanInTheLoop({
    name: "ambiguous_create_document",
    description: "Approve creation of one new document in Ambiguous.",
    parameters: createDocumentSchema,
    render: ({ status, args, respond }) => (
      <article className={`generative-card approval-card generative-card-${status}`}>
        <p className="generative-label">Approval required / workspace write</p>
        <strong>{args.title ?? "Preparing document proposal"}</strong>
        <p className="approval-preview">{args.content?.slice(0, 420) ?? "Waiting for the final draft..."}</p>
        {status === "executing" && respond ? (
          <div className="approval-actions">
            <button
              type="button"
              className="approval-reject"
              onClick={() => respond({ accepted: false, note: "Rejected by the user" })}
            >
              Reject write
            </button>
            <button
              type="button"
              className="approval-accept"
              onClick={() => {
                documentWriteApproved.current = true;
                onCheckpoint("approval");
                respond({ accepted: true });
              }}
            >
              Approve document
            </button>
          </div>
        ) : (
          <small>{status === "complete" ? "Decision recorded" : "Awaiting complete proposal"}</small>
        )}
      </article>
    ),
  });

  useHumanInTheLoop({
    name: "ambiguous_create_draft_email",
    description: "Approve creation of an email draft in Ambiguous Mail. This does not send it.",
    parameters: createDraftSchema,
    render: ({ status, args, respond }) => (
      <article className={`generative-card approval-card mail-card generative-card-${status}`}>
        <p className="generative-label">Approval required / create mail draft</p>
        <strong>{args.subject ?? "Preparing email draft"}</strong>
        <small>To: {args.to?.join(", ") || "No recipients yet"}</small>
        <p className="approval-preview">{args.body_markdown?.slice(0, 420) ?? "Waiting for draft content..."}</p>
        {status === "executing" && respond ? (
          <div className="approval-actions">
            <button
              type="button"
              className="approval-reject"
              onClick={() => respond({ accepted: false, note: "Draft rejected by the user" })}
            >
              Reject draft
            </button>
            <button
              type="button"
              className="approval-accept"
              onClick={() => respond({ accepted: true })}
            >
              Create draft
            </button>
          </div>
        ) : (
          <small>This action creates a draft only. Sending is not available.</small>
        )}
      </article>
    ),
  });

  useHumanInTheLoop({
    name: "ambiguous_batch_modify_emails",
    description: "Approve adding labels to explicit email IDs.",
    parameters: labelEmailSchema,
    render: ({ status, args, respond }) => (
      <article className={`generative-card approval-card mail-card generative-card-${status}`}>
        <p className="generative-label">Approval required / label mail</p>
        <strong>Add {args.add_labels?.join(", ") || "labels"}</strong>
        <small>{args.ids?.length ?? 0} explicit message IDs; no broad search mutation</small>
        {status === "executing" && respond ? (
          <div className="approval-actions">
            <button
              type="button"
              className="approval-reject"
              onClick={() => respond({ accepted: false, note: "Label change rejected by the user" })}
            >
              Reject labels
            </button>
            <button
              type="button"
              className="approval-accept"
              onClick={() => respond({ accepted: true })}
            >
              Apply labels
            </button>
          </div>
        ) : (
          <small>Only additive labels are permitted.</small>
        )}
      </article>
    ),
  });

  useDefaultRenderTool({
    render: ({ name, status, parameters, result }) => (
      <article className={`generative-card generative-card-${status}`}>
        <p className="generative-label">Tool activity</p>
        <strong>{name.replace(/^ambiguous_/, "Ambiguous / ").replaceAll("_", " ")}</strong>
        {status === "executing" ? <small>Executing with verified arguments</small> : null}
        {status === "complete" ? <p>{shortResult(result)}</p> : null}
        {status === "inProgress" && parameters ? <small>Preparing arguments</small> : null}
      </article>
    ),
  });

  return null;
}
