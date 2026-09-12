import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = (process.env.AGENT_URL ?? "http://localhost:8000").replace(/\/$/, "");

  try {
    const response = await fetch(`${baseUrl}/historyz?limit=8`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    const body = await response.json();
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ runs: [] }, { status: 503 });
  }
}
