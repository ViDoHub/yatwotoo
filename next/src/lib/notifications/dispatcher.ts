import { createServerClient } from "@/lib/supabase/server";
import { sendWhatsApp } from "./whatsapp";
import { sendTelegram } from "./telegram";
import { sendEmail } from "./email";
import type { Listing } from "@/types";

/**
 * Send a message to all enabled notification channels.
 */
async function sendToAllChannels(message: string, subject: string = ""): Promise<boolean> {
  const supabase = createServerClient();
  const { data: settings } = await supabase
    .from("user_settings")
    .select("*")
    .limit(1)
    .single();

  if (!settings?.notifications_enabled) {
    return false;
  }

  let anySuccess = false;

  if (settings.whatsapp_enabled) {
    try {
      const ok = await sendWhatsApp(message);
      anySuccess = anySuccess || ok;
    } catch (e) {
      console.error("WhatsApp dispatch error:", e);
    }
  }

  if (settings.telegram_enabled) {
    try {
      const ok = await sendTelegram(message);
      anySuccess = anySuccess || ok;
    } catch (e) {
      console.error("Telegram dispatch error:", e);
    }
  }

  if (settings.email_enabled) {
    try {
      const ok = await sendEmail(subject || "Yad2 Alert", message);
      anySuccess = anySuccess || ok;
    } catch (e) {
      console.error("Email dispatch error:", e);
    }
  }

  return anySuccess;
}

/**
 * Format and send notification for a new listing.
 */
export async function notifyNewListing(
  listing: Listing,
  savedSearchId: string
): Promise<boolean> {
  const supabase = createServerClient();

  // Check if already notified
  const { data: existing } = await supabase
    .from("notification_logs")
    .select("id")
    .eq("saved_search_id", savedSearchId)
    .eq("listing_id", listing.yad2_id)
    .eq("message_type", "new_listing")
    .limit(1);

  if (existing?.length) return false;

  const message = formatNewListingMessage(listing);
  const success = await sendToAllChannels(message, "Yad2: דירה חדשה נמצאה!");

  if (success) {
    await supabase.from("notification_logs").insert({
      saved_search_id: savedSearchId,
      listing_id: listing.yad2_id,
      message_type: "new_listing",
    });
  }

  return success;
}

/**
 * Format and send notification for a price drop.
 */
export async function notifyPriceDrop(
  listing: Listing,
  oldPrice: number,
  savedSearchId: string
): Promise<boolean> {
  const supabase = createServerClient();

  const { data: existing } = await supabase
    .from("notification_logs")
    .select("id")
    .eq("saved_search_id", savedSearchId)
    .eq("listing_id", listing.yad2_id)
    .eq("message_type", "price_drop")
    .limit(1);

  if (existing?.length) return false;

  const message = formatPriceDropMessage(listing, oldPrice);
  const success = await sendToAllChannels(message, "Yad2: ירידת מחיר!");

  if (success) {
    await supabase.from("notification_logs").insert({
      saved_search_id: savedSearchId,
      listing_id: listing.yad2_id,
      message_type: "price_drop",
    });
  }

  return success;
}

function formatNewListingMessage(listing: Listing): string {
  const parts: string[] = ["*דירה חדשה נמצאה!* 🏠\n"];

  if (listing.street) {
    let addr = listing.street;
    if (listing.house_number) addr += ` ${listing.house_number}`;
    addr += `, ${listing.city}`;
    parts.push(`📍 ${addr}`);
  } else if (listing.city) {
    parts.push(`📍 ${listing.city}`);
  }

  if (listing.neighborhood) {
    parts.push(`🏘️ ${listing.neighborhood}`);
  }

  const details: string[] = [];
  if (listing.rooms) details.push(`${listing.rooms} חדרים`);
  if (listing.sqm) details.push(`${listing.sqm} מ"ר`);
  if (listing.floor != null) details.push(`קומה ${listing.floor}`);
  if (details.length) parts.push(`📐 ${details.join(" | ")}`);

  if (listing.price) {
    parts.push(`💰 ${listing.price.toLocaleString()} ₪/חודש`);
    if (listing.price_per_sqm) {
      parts.push(`📊 ${Math.round(listing.price_per_sqm)} ₪/מ"ר`);
    }
  }

  if (listing.entry_date) {
    parts.push(`📅 כניסה: ${listing.entry_date}`);
  }

  parts.push(`\n🔗 ${listing.url}`);
  return parts.join("\n");
}

function formatPriceDropMessage(listing: Listing, oldPrice: number): string {
  const parts: string[] = ["*ירידת מחיר!* 📉\n"];

  if (listing.street) {
    parts.push(`📍 ${listing.street}, ${listing.city}`);
  }

  parts.push(`💰 ${oldPrice.toLocaleString()} ₪ → *${(listing.price ?? 0).toLocaleString()} ₪*`);

  const price = listing.price ?? 0;
  const diff = oldPrice - price;
  const percent = oldPrice ? (diff / oldPrice) * 100 : 0;
  parts.push(`📉 חיסכון: ${diff.toLocaleString()} ₪ (${percent.toFixed(1)}%)`);

  parts.push(`\n🔗 ${listing.url}`);
  return parts.join("\n");
}
