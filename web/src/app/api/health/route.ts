import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = (process.env.AGENT_URL ?? "http://localhost:8000").replace(/\/$/, "");

  try {
    const response = await fetch(`${baseUrl}/healthz`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    const body = await response.json();
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json(
      {
        status: "unavailable",
        agent: "workspace-council",
        mcp: { reader: false, publisher: false },
      },
      { status: 503 },
    );
  }
}
