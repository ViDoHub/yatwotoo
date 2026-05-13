import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { sendWhatsApp } from "@/lib/notifications/whatsapp";
import { sendTelegram } from "@/lib/notifications/telegram";
import { sendEmail } from "@/lib/notifications/email";

/**
 * GET /api/settings — Get user settings
 * PUT /api/settings — Update user settings
 */
export async function GET() {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .limit(1)
    .single();

  if (error) {
    // No settings row yet — return defaults
    return NextResponse.json({
      settings: {
        notifications_enabled: false,
        whatsapp_enabled: false,
        telegram_enabled: false,
        email_enabled: false,
        poll_interval_minutes: 15,
      },
    });
  }

  return NextResponse.json({ settings: data });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const supabase = createServerClient();

  // Upsert — insert if no row exists, update if it does
  const { data: existing } = await supabase
    .from("user_settings")
    .select("id")
    .limit(1)
    .single();

  let result;
  if (existing) {
    result = await supabase
      .from("user_settings")
      .update(body)
      .eq("id", existing.id)
      .select()
      .single();
  } else {
    result = await supabase
      .from("user_settings")
      .insert(body)
      .select()
      .single();
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: result.data });
}

/**
 * POST /api/settings/test/[channel]
 * Send a test notification on the specified channel.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/");
  const channel = pathParts[pathParts.length - 1];

  const testMessage = "🧪 Yad2Search test notification - הכל עובד!";

  let success = false;

  switch (channel) {
    case "whatsapp":
      success = await sendWhatsApp(testMessage);
      break;
    case "telegram":
      success = await sendTelegram(testMessage);
      break;
    case "email":
      success = await sendEmail("Yad2Search Test", testMessage);
      break;
    default:
      return NextResponse.json(
        { error: `Unknown channel: ${channel}` },
        { status: 400 }
      );
  }

  return NextResponse.json({ success, channel });
}
