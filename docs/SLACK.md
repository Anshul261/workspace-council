# Slack channel setup

This repository uses the managed CopilotKit Channels path. Slack credentials stay
in CopilotKit Intelligence; the worker in `web/src/channels/` only receives an
Intelligence project key and forwards turns to the existing Python AG-UI service.

## 1. Create the managed channel

1. Create or open a CopilotKit Intelligence project.
2. Open **Channels**, choose **Add channel**, select **Slack**, and use a code such
   as `workspace-council`. Copy that exact code into `CHANNEL_CODE`.
3. In the project sidebar, open **API Keys** and create a project-scoped runtime
   key. Copy it into `INTELLIGENCE_API_KEY`.

## 2. Create and connect the Slack app

In the Slack API dashboard, create an app for the development workspace. In its
CopilotKit Intelligence Slack setup panel, apply the generated Slack manifest,
then provide these values to Intelligence (not to this repository):

| Value | Where to find it in Slack | Starts with |
| --- | --- | --- |
| Bot User OAuth Token | **OAuth & Permissions** after **Install to Workspace** | `xoxb-` |
| Signing Secret | **Basic Information** → **App Credentials** | no fixed prefix |

The generated manifest enables the `app_mention` event, `app_mentions:read` and
`chat:write`, plus Block Kit interactivity for approval buttons. Reinstall the
app after changing scopes or applying a new manifest. Invite it into a channel
with `/invite @your-app`, then mention it with `@your-app summarize this thread`.

Do not enable Slack Socket Mode for this managed integration. Intelligence owns
the public Slack request URL and signed interactive-message callback.

## 3. Configure the local worker

Copy `web/.env.example` to `web/.env.local` and set:

```env
AGENT_URL=http://localhost:8000
INTELLIGENCE_API_KEY=<project runtime key from CopilotKit Intelligence>
CHANNEL_CODE=workspace-council
CHANNEL_PORT=3001
```

For deployed services, set `AGENT_URL` to the Python AgentOS service address
reachable from the worker. It is not a browser variable.

### Optional protection for AG-UI

Generate a long random secret and set the same header value in both the
repository-root `.env` (Python service) and `web/.env.local` (Node worker):

```env
AGENT_AUTH_HEADER=Bearer <long-random-value>
```

When set, the Python service rejects unauthenticated `/agui` requests. The
browser's existing server-side CopilotKit route and the new Slack worker both
forward that header.

### Optional delegated approvers

By default, only the Slack user who started a council request can approve its
write. To let named teammates approve, add their comma-separated Slack Member
IDs to the worker environment:

```env
SLACK_APPROVER_IDS=U01234567,U76543210
```

Find a Member ID by opening a person's Slack profile, choosing **More**, then
**Copy member ID**. Display names are not authorization identifiers.

## 4. Run and verify

Start the Python service first, then start the persistent Node worker:

```powershell
cd web
npm run channels
```

The worker exits rather than pretending to be healthy if the managed Channel is
not online. Verify three cases in Slack:

1. Mention the bot in an invited channel and receive a threaded council reply.
2. Ask for a document publication, click **Reject**, and confirm no document is created.
3. Repeat, click **Approve**, and confirm the council returns the verified Ambiguous record ID or link.

The generated `web/.channels/` directory, `.env` files, Slack tokens, signing
secret, and Intelligence key are ignored by Git and must never be committed.
