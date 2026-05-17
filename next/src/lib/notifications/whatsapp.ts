import { createAdminClient } from "@/lib/supabase/server";

const CALLMEBOT_URL = "https://api.callmebot.com/whatsapp.php";

/**
 * Send a WhatsApp message via Callmebot API.
 */
export async function sendWhatsApp(
  message: string,
  phone?: string,
  apikey?: string
): Promise<boolean> {
  if (!phone || !apikey) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("user_settings")
      .select("whatsapp_phone, whatsapp_apikey")
      .limit(1)
      .single();

    if (!data?.whatsapp_phone || !data?.whatsapp_apikey) {
      console.warn("WhatsApp not configured");
      return false;
    }
    phone = data.whatsapp_phone;
    apikey = data.whatsapp_apikey;
  }

  const url = new URL(CALLMEBOT_URL);
  url.searchParams.set("phone", phone);
  url.searchParams.set("text", message);
  url.searchParams.set("apikey", apikey);

  try {
    const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
    if (resp.ok) {
      console.log(`WhatsApp message sent to ${phone}`);
      return true;
    }
    console.error(`Callmebot returned ${resp.status}`);
    return false;
  } catch (e) {
    console.error("Error sending WhatsApp:", e);
    return false;
  }
}
