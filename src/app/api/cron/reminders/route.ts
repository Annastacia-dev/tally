import { NextResponse } from "next/server";
import { runReminders } from "@/lib/reminders";

// Called daily by Vercel Cron (see vercel.json). Vercel sends
// "Authorization: Bearer $CRON_SECRET" when CRON_SECRET is set.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sent = await runReminders();
  return NextResponse.json({ ok: true, sent });
}
