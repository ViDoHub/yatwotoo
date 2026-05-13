import { NextResponse } from "next/server";
import { sendWhatsApp } from "@/lib/notifications/whatsapp";
import { sendTelegram } from "@/lib/notifications/telegram";
import { sendEmail } from "@/lib/notifications/email";

/**
 * POST /api/settings/test/[channel]
 * Send a test notification on the specified channel.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ channel: string }> }
) {
  const { channel } = await params;
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
