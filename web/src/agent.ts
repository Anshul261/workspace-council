import { HttpAgent } from "@ag-ui/client";

export function createDefaultAgent() {
  const baseUrl = (process.env.AGENT_URL ?? "http://localhost:8000").replace(/\/$/, "");
  return new HttpAgent({ url: `${baseUrl}/agui` });
}
