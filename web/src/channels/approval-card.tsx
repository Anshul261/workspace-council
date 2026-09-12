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
  summary: string;
  requesterId: string;
};

function allowedApprover(actorId: string, requesterId: string): boolean {
  if (actorId === requesterId) return true;

  const configuredApprovers = (process.env.SLACK_APPROVER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  return configuredApprovers.includes(actorId);
}

function resolvedCard(summary: string, accepted: boolean) {
  return (
    <Message fallbackText={accepted ? "Council write approved" : "Council write rejected"}>
      <Header>{accepted ? "Approval recorded" : "Write rejected"}</Header>
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
  if (!decision) {
    await context.thread.post("The approval value was missing. Please try again.");
    return;
  }

  if (!allowedApprover(context.actor.id, requesterId)) {
    await context.thread.post(
      "Only the person who started this request, or a configured council approver, can approve it.",
    );
    return;
  }

  if (context.message.ref?.id) {
    try {
      await context.thread.update(
        context.message.ref,
        resolvedCard(summary, decision.accepted),
      );
    } catch {
      // The decision still must reach the agent when Slack cannot update the card.
    }
  }

  await context.thread.resume(decision);
}

/**
 * Registered Channels JSX component. In Slack it renders as a Block Kit card
 * whose callbacks resume the paused AG-UI run on a later delivery.
 */
export function ApprovalCard({ summary, requesterId }: ApprovalCardProps) {
  return (
    <Message fallbackText="Council approval required before a workspace write">
      <Header>Approval required</Header>
      <Section>{summary}</Section>
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
