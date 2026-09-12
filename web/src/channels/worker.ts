import { createServer } from "node:http";

import { CopilotKitIntelligence, CopilotRuntime } from "@copilotkit/runtime/v2";
import { createCopilotNodeListener } from "@copilotkit/runtime/v2/node";

import { councilChannel } from "./council-channel.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function channelPort(): number {
  const value = Number(process.env.CHANNEL_PORT ?? 3001);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error("CHANNEL_PORT must be an integer between 1 and 65535");
  }
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

const listener = createCopilotNodeListener({ runtime, basePath: "/api/copilotkit" });
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
  if (channels.status().overall !== "online") {
    throw new Error("Slack channel did not reach online status");
  }
  server.listen(channelPort(), process.env.CHANNEL_HOST ?? "127.0.0.1", () => {
    console.log(`Workspace Council Slack channel online on port ${channelPort()}`);
  });
} catch (error) {
  await shutdown(1);
  throw error;
}
