import {
  CopilotRuntime,
  InMemoryAgentRunner,
  createCopilotRuntimeHandler,
} from "@copilotkit/runtime/v2";

import { createDefaultAgent } from "@/agent";

const runtime = new CopilotRuntime({
  agents: { default: createDefaultAgent() },
  runner: new InMemoryAgentRunner(),
});

const handler = createCopilotRuntimeHandler({
  runtime,
  basePath: "/api/copilotkit",
  activateChannels: false,
});

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
