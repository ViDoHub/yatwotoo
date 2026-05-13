#!/usr/bin/env node
/**
 * Migration script: MongoDB → Supabase (PostgreSQL)
 *
 * Prerequisites:
 *   npm install mongodb @supabase/supabase-js
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... MONGO_URI=... node scripts/migrate-mongo-to-supabase.mjs
 *
 * Env defaults:
 *   MONGO_URI=mongodb://localhost:27017
 *   MONGO_DB=yad2search
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from .env.local
 */

import { MongoClient } from "mongodb";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local if present
try {
  const envPath = resolve(__dirname, "../.env.local");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
} catch {}

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const MONGO_DB = process.env.MONGO_DB || "yad2search";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BATCH_SIZE = 500;

function transformListing(doc) {
  const addr = doc.address || {};
  const amenities = doc.amenities || {};
  const coords = doc.location?.coordinates; // [lng, lat]

  return {
    yad2_id: doc.yad2_id,
    deal_type: doc.deal_type || "rent",
    city: addr.city || "",
    neighborhood: addr.neighborhood || "",
    street: addr.street || "",
    house_number: addr.house_number || "",
    area: addr.area || "",
    area_id: addr.area_id || 0,
    top_area: addr.top_area || "",
    top_area_id: addr.top_area_id || 0,
    rooms: doc.rooms ?? null,
    floor: doc.floor ?? null,
    sqm: doc.sqm ?? null,
    price: doc.price ?? null,
    price_per_sqm: doc.price_per_sqm ?? null,
    parking: amenities.parking ?? null,
    elevator: amenities.elevator ?? null,
    balcony: amenities.balcony ?? null,
    pets_allowed: amenities.pets_allowed ?? null,
    air_conditioning: amenities.air_conditioning ?? null,
    furnished: amenities.furnished ?? null,
    accessible: amenities.accessible ?? null,
    bars: amenities.bars ?? null,
    boiler: amenities.boiler ?? null,
    shelter: amenities.shelter ?? null,
    renovated: amenities.renovated ?? null,
    long_term: amenities.long_term ?? null,
    storage: amenities.storage ?? null,
    for_partners: amenities.for_partners ?? null,
    location: coords ? `SRID=4326;POINT(${coords[0]} ${coords[1]})` : null,
    description: doc.description || "",
    images: doc.images || [],
    url: doc.url || "",
    entry_date: doc.entry_date || "",
    date_added: doc.date_added || "",
    date_updated: doc.date_updated || "",
    project_name: doc.project_name || "",
    property_tax: doc.property_tax || "",
    house_committee: doc.house_committee || "",
    total_floors: doc.total_floors ?? null,
    contact_name: doc.contact_name || "",
    parking_spots: doc.parking_spots ?? null,
    garden_area: doc.garden_area ?? null,
    payments_in_year: doc.payments_in_year ?? null,
    first_seen_at: doc.first_seen_at ? new Date(doc.first_seen_at).toISOString() : "1970-01-01T00:00:00Z",
    last_seen_at: doc.last_seen_at ? new Date(doc.last_seen_at).toISOString() : new Date().toISOString(),
    is_active: doc.is_active ?? true,
    is_hidden: doc.is_hidden ?? false,
  };
}

function transformPriceHistory(doc) {
  return {
    listing_id: doc.listing_id,
    price: doc.price,
    observed_at: doc.observed_at ? new Date(doc.observed_at).toISOString() : new Date().toISOString(),
  };
}

function transformSavedSearch(doc) {
  return {
    name: doc.name || "Unnamed Search",
    filters: doc.filters || {},
    is_active: doc.is_active ?? true,
    created_at: doc.created_at ? new Date(doc.created_at).toISOString() : new Date().toISOString(),
  };
}

function transformSettings(doc) {
  return {
    whatsapp_enabled: doc.whatsapp_enabled ?? true,
    whatsapp_phone: doc.whatsapp_phone || "",
    whatsapp_apikey: doc.whatsapp_apikey || "",
    telegram_enabled: doc.telegram_enabled ?? false,
    telegram_bot_token: doc.telegram_bot_token || "",
    telegram_chat_id: doc.telegram_chat_id || "",
    email_enabled: doc.email_enabled ?? false,
    email_smtp_host: "",
    email_smtp_port: 587,
    email_smtp_user: "",
    email_smtp_password: "",
    email_to: doc.email_to || "",
    poll_interval_minutes: doc.poll_interval_minutes || 15,
    notifications_enabled: doc.notifications_enabled ?? true,
  };
}

async function migrateCollection(db, collectionName, transformFn, tableName, label) {
  console.log(`\n📦 Migrating ${label}...`);
  const collection = db.collection(collectionName);
  const total = await collection.countDocuments();
  console.log(`   Found ${total} documents`);

  let migrated = 0;
  let errors = 0;
  const cursor = collection.find().batchSize(BATCH_SIZE);

  let batch = [];
  for await (const doc of cursor) {
    try {
      batch.push(transformFn(doc));
    } catch (e) {
      errors++;
      continue;
    }

    if (batch.length >= BATCH_SIZE) {
      const { error } = await supabase.from(tableName).upsert(batch, {
        onConflict: tableName === "listings" ? "yad2_id" : undefined,
        ignoreDuplicates: true,
      });
      if (error) {
        console.error(`   ❌ Batch error: ${error.message}`);
        errors += batch.length;
      } else {
        migrated += batch.length;
      }
      batch = [];
      process.stdout.write(`   ✓ ${migrated}/${total} migrated\r`);
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    const { error } = await supabase.from(tableName).upsert(batch, {
      onConflict: tableName === "listings" ? "yad2_id" : undefined,
      ignoreDuplicates: true,
    });
    if (error) {
      console.error(`   ❌ Final batch error: ${error.message}`);
      errors += batch.length;
    } else {
      migrated += batch.length;
    }
  }

  console.log(`   ✅ Done: ${migrated} migrated, ${errors} errors`);
}

async function main() {
  console.log("🚀 MongoDB → Supabase Migration");
  console.log(`   Mongo: ${MONGO_URI}/${MONGO_DB}`);
  console.log(`   Supabase: ${SUPABASE_URL}`);

  const mongo = new MongoClient(MONGO_URI);
  await mongo.connect();
  const db = mongo.db(MONGO_DB);

  // 1. Migrate listings first (price_history references them)
  await migrateCollection(db, "listings", transformListing, "listings", "Listings");

  // 2. Migrate saved searches
  await migrateCollection(db, "saved_searches", transformSavedSearch, "saved_searches", "Saved Searches");

  // 3. Migrate user settings
  console.log("\n📦 Migrating User Settings...");
  const settingsDoc = await db.collection("user_settings").findOne();
  if (settingsDoc) {
    const { error } = await supabase.from("user_settings").upsert([transformSettings(settingsDoc)]);
    if (error) {
      console.error(`   ❌ Settings error: ${error.message}`);
    } else {
      console.log("   ✅ Settings migrated");
    }
  } else {
    console.log("   ⚠️ No settings found");
  }

  // 4. Migrate price history (large volume - use bigger batches)
  await migrateCollection(db, "price_history", transformPriceHistory, "price_history", "Price History");

  await mongo.close();
  console.log("\n🎉 Migration complete!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
