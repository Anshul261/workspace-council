# Slack channel setup

Workspace Council uses a persistent CopilotKit Channels worker. Slack is a
transport only: each Slack thread connects through AG-UI to the same Python
Agno team used by the browser experience.

## 1. Create the managed channel

1. Create or open a CopilotKit Intelligence project.
2. In **Channels**, add a Slack channel and choose a code such as
   `workspace-council`.
3. Create a project runtime key under **API Keys**.
4. Apply the generated Slack manifest and install the app to the development
   workspace.
5. Store the Slack Bot User OAuth token and Signing Secret in CopilotKit
   Intelligence, never in this repository.

The generated Slack app should use `app_mention`, `app_mentions:read`, and
`chat:write`. CopilotKit Intelligence owns Slack request verification and Block
Kit callbacks, so do not enable Socket Mode for this managed integration.

## 2. Configure the worker

Create `web/.env.local` from `web/.env.example` and set:

```env
AGENT_URL=http://localhost:8000
INTELLIGENCE_API_KEY=<copilotkit-project-runtime-key>
CHANNEL_CODE=workspace-council
CHANNEL_PORT=3001
```

The worker command uses Node's `--env-file-if-exists=.env.local`, so these
values are loaded by the standalone process rather than by Next.js.

For a deployed service, protect AgentOS with a long random value in both the
repository-root `.env` and `web/.env.local`:

```env
AGENT_AUTH_HEADER=Bearer <long-random-value>
```

The Next.js runtime and Slack worker forward this value to `/agui`. Health and
sanitized mission-history endpoints remain accessible for service checks.

## 3. Restrict access

The current Ambiguous connection uses one service credential. Restrict the
Slack users who can invoke it before inviting the app into channels containing
sensitive data:

```env
SLACK_ALLOWED_USER_IDS=U01234567,U76543210
SLACK_APPROVER_IDS=U01234567
```

If `SLACK_ALLOWED_USER_IDS` is empty, any user who can mention the installed bot
can request reads through the council's curated tools. Approvals do not protect
read operations, so an allowlist is strongly recommended.

Only the requester or a member listed in `SLACK_APPROVER_IDS` can approve a
mutation. Slack approval cards fail closed and support only:

- `ambiguous_create_document`
- `ambiguous_create_draft_email`
- `ambiguous_batch_modify_emails`

No send-email, delete, archive, trash, or overwrite operation is exposed.

## 4. Run

Start AgentOS, then the browser and Slack processes:

```bash
uv run uvicorn workspace_council.app:app --host 0.0.0.0 --port 8000
cd web
npm run dev
npm run channels
```

The channel process exits if `INTELLIGENCE_API_KEY` or `CHANNEL_CODE` is absent,
or if CopilotKit Intelligence does not report the managed channel online within
30 seconds.

## 5. Verify

1. Invite the app to an allowed Slack channel.
2. Mention it with a read-only request and confirm the response remains in the
   originating thread.
3. Request a document creation and reject the approval card. Confirm no record
   is created.
4. Repeat, approve the card, and confirm the response includes the real
   Ambiguous document ID from read-back verification.
5. Ask for an email draft and verify the card shows recipients, subject, and a
   body preview. The integration cannot send email.
