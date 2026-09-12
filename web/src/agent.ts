import { HttpAgent } from "@ag-ui/client";

export function createDefaultAgent(threadId?: string) {
  const baseUrl = (process.env.AGENT_URL ?? "http://localhost:8000").replace(/\/$/, "");
  const authHeader = process.env.AGENT_AUTH_HEADER;

  return new HttpAgent({
    url: `${baseUrl}/agui`,
    ...(threadId ? { threadId } : {}),
    ...(authHeader ? { headers: { Authorization: authHeader } } : {}),
  });
}
