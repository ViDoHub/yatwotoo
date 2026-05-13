import { NextResponse } from "next/server";

/**
 * GET /api/cron/cleanup
 * Vercel Cron handler — triggers stale listing cleanup.
 * Runs daily at 3am.
 */
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : "http://localhost:3000";

  const resp = await fetch(`${baseUrl}/api/scrape/cleanup`, {
    method: "POST",
  });
  const result = await resp.json();

  return NextResponse.json(result);
}
