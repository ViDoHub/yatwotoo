import { createServerClient } from "@/lib/supabase/server";

/**
 * Send a Telegram message via Bot API.
 */
export async function sendTelegram(
  message: string,
  token?: string,
  chatId?: string
): Promise<boolean> {
  if (!token || !chatId) {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("user_settings")
      .select("telegram_bot_token, telegram_chat_id")
      .limit(1)
      .single();

    if (!data?.telegram_bot_token || !data?.telegram_chat_id) {
      console.warn("Telegram not configured");
      return false;
    }
    token = data.telegram_bot_token;
    chatId = data.telegram_chat_id;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (resp.ok) {
      console.log("Telegram message sent");
      return true;
    }
    console.error(`Telegram API error ${resp.status}`);
    return false;
  } catch (e) {
    console.error("Error sending Telegram:", e);
    return false;
  }
}
