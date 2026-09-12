import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const baseUrl = (process.env.AGENT_URL ?? "http://localhost:8000").replace(/\/$/, "");

  try {
    const response = await fetch(`${baseUrl}/historyz/${encodeURIComponent(runId)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    const body = await response.json();
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ detail: "History unavailable" }, { status: 503 });
  }
}
