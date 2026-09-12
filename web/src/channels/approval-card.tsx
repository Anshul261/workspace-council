import {
  Actions,
  Button,
  Header,
  Message,
  Section,
} from "@copilotkit/channels/ui";
import type { InteractionContext } from "@copilotkit/channels/ui";

type ApprovalDecision = { accepted: boolean };

export type ApprovalCardProps = {
  operation: string;
  summary: string;
  details: string;
  requesterId: string;
};

export function allowedApprover(actorId: string, requesterId: string): boolean {
  if (actorId === requesterId) return true;
  return (process.env.SLACK_APPROVER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(actorId);
}

function resolvedCard(summary: string, accepted: boolean) {
  return (
    <Message fallbackText={accepted ? "Council action approved" : "Council action rejected"}>
      <Header>{accepted ? "Approval recorded" : "Action rejected"}</Header>
      <Section>{summary}</Section>
    </Message>
  );
}

async function resolveApproval(
  context: InteractionContext<ApprovalDecision>,
  summary: string,
  requesterId: string,
) {
  const decision = context.action.value;
  if (!decision || typeof decision.accepted !== "boolean") {
    await context.thread.post("The approval decision was invalid. Please try again.");
    return;
  }
  if (!allowedApprover(context.actor.id, requesterId)) {
    await context.thread.post(
      "Only the requester or a configured Workspace Council approver can decide this action.",
    );
    return;
  }

  try {
    await context.thread.resume(decision);
  } catch {
    await context.thread.post("The council could not resume. The action was not recorded; please retry.");
    return;
  }

  if (context.message.ref?.id) {
    try {
      await context.thread.update(context.message.ref, resolvedCard(summary, decision.accepted));
    } catch {
      await context.thread.post(decision.accepted ? "Approval recorded." : "Rejection recorded.");
    }
  }
}

export function ApprovalCard({ operation, summary, details, requesterId }: ApprovalCardProps) {
  return (
    <Message fallbackText={`Council approval required for ${operation}`}>
      <Header>Approval required: {operation}</Header>
      <Section>{summary}</Section>
      <Section>{details}</Section>
      <Actions>
        <Button
          style="primary"
          value={{ accepted: true }}
          onClick={(context) => resolveApproval(context, summary, requesterId)}
        >
          Approve
        </Button>
        <Button
          style="danger"
          value={{ accepted: false }}
          onClick={(context) => resolveApproval(context, summary, requesterId)}
        >
          Reject
        </Button>
      </Actions>
    </Message>
  );
}
