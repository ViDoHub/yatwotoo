import { NextResponse } from "next/server";

/**
 * GET /api/cron/enrich
 * Vercel Cron handler — triggers amenity enrichment.
 * Runs every 30 minutes.
 */
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : "http://localhost:3000";

  const resp = await fetch(`${baseUrl}/api/scrape/enrich`, {
    method: "POST",
  });
  const result = await resp.json();

  return NextResponse.json(result);
}
