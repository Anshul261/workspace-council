import { createServer } from "node:http";

import { CopilotKitIntelligence, CopilotRuntime } from "@copilotkit/runtime/v2";
import { createCopilotNodeListener } from "@copilotkit/runtime/v2/node";

import { councilChannel } from "./council-channel.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const intelligence = new CopilotKitIntelligence({
  apiKey: required("INTELLIGENCE_API_KEY"),
  apiUrl: process.env.INTELLIGENCE_API_URL,
  wsUrl: process.env.INTELLIGENCE_GATEWAY_WS_URL,
});

const runtime = new CopilotRuntime({
  agents: {},
  intelligence,
  channels: [councilChannel],
});

// A Node listener owns the persistent Intelligence gateway connection. This is
// intentionally separate from the short-lived Next.js route handler.
const listener = createCopilotNodeListener({
  runtime,
  basePath: "/api/copilotkit",
});
const channels = listener.channels;
const server = createServer(listener);

let shuttingDown = false;
async function shutdown(exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  await channels.stop();
  if (server.listening) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  process.exitCode = exitCode;
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

try {
  await channels.ready({ timeoutMs: 30_000 });
  const status = channels.status();
  if (status.overall !== "online") {
    throw new Error(`Slack Channel is not online: ${JSON.stringify(status)}`);
  }

  const port = Number(process.env.CHANNEL_PORT ?? 3001);
  server.listen(port, () => {
    console.log(`Workspace Council Slack Channel online; lifecycle server listening on :${port}`);
  });
} catch (error) {
  await shutdown(1);
  throw error;
}
