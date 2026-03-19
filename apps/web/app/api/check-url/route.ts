import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ ok: false, error: "Missing url" }, { status: 400 });

  // Basic URL validation
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json({ ok: false, error: "Only HTTP/HTTPS URLs are supported" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid URL" }, { status: 400 });
  }

  const start = Date.now();
  try {
    const res = await fetch(parsed.toString(), {
      method: "HEAD",
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
      headers: { "User-Agent": "PulseDock/1.0 (uptime check demo)" },
    });
    const latencyMs = Date.now() - start;
    const ok = res.status >= 200 && res.status < 400;
    return NextResponse.json({ ok, status: res.status, latencyMs }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : "Unknown error";
    const isTimeout = message.includes("timeout") || message.includes("abort");
    return NextResponse.json(
      { ok: false, error: isTimeout ? "Timeout" : "Request failed", latencyMs },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
