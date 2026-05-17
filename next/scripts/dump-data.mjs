/**
 * Dump shared data from remote Supabase via REST API.
 * Outputs SQL INSERT statements to supabase/seed.sql.
 * 
 * Tables dumped: listings, price_history, scrape_jobs
 * Tables skipped: board_listings, saved_searches, hidden_listings,
 *                 notification_logs, user_settings (user-scoped)
 * 
 * Usage: node scripts/dump-data.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { db: { schema: "public" }, global: { fetch } }
);

function escapeSQL(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number") return String(val);
  if (Array.isArray(val)) {
    // PostgreSQL array literal
    const items = val.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(",");
    return `'{${items}}'`;
  }
  if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function fetchAll(table, orderBy = "id") {
  const rows = [];
  const pageSize = 500;
  let lastId = null;
  
  while (true) {
    let query = supabase
      .from(table)
      .select("*")
      .order("id")
      .limit(pageSize);
    
    if (lastId) {
      query = query.gt("id", lastId);
    }
    
    const { data, error } = await query;
    
    if (error) throw new Error(`Error fetching ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    
    rows.push(...data);
    lastId = data[data.length - 1].id;
    process.stdout.write(`\r  ${table}: ${rows.length} rows fetched...`);
    
    if (data.length < pageSize) break;
  }
  
  console.log(`\r  ${table}: ${rows.length} rows total        `);
  return rows;
}

function generateInserts(table, rows, columns) {
  if (rows.length === 0) return "";
  
  const lines = [];
  lines.push(`-- ${table}: ${rows.length} rows`);
  lines.push(`TRUNCATE ${table} CASCADE;`);
  
  // Batch inserts in groups of 100
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const colList = columns.join(", ");
    const values = batch.map((row) => {
      const vals = columns.map((col) => {
        const val = row[col];
        // Handle geography/point columns
        if (col === "location" && val) {
          // Supabase returns geography as GeoJSON or WKT
          if (typeof val === "object" && val.coordinates) {
            const [lng, lat] = val.coordinates;
            return `ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
          }
          if (typeof val === "string" && val.startsWith("SRID=")) {
            return `'${val}'::geography`;
          }
          return `'${String(val)}'::geography`;
        }
        return escapeSQL(val);
      });
      return `(${vals.join(", ")})`;
    });
    
    lines.push(`INSERT INTO ${table} (${colList}) VALUES`);
    lines.push(values.join(",\n") + ";");
  }
  
  return lines.join("\n") + "\n\n";
}

async function main() {
  console.log("Dumping shared data from remote Supabase...\n");
  
  const output = [];
  output.push("-- Seed data dumped from remote Supabase");
  output.push(`-- Generated: ${new Date().toISOString()}`);
  output.push("-- Tables: listings, price_history, scrape_jobs\n");
  
  // Dump listings
  console.log("Fetching listings...");
  const listings = await fetchAll("listings", "first_seen_at");
  
  const listingCols = [
    "id", "yad2_id", "deal_type",
    "city", "neighborhood", "street", "house_number", "area", "area_id", "top_area", "top_area_id",
    "rooms", "floor", "sqm", "price", "price_per_sqm",
    "parking", "elevator", "balcony", "pets_allowed", "air_conditioning",
    "furnished", "accessible", "bars", "boiler", "shelter", "renovated",
    "long_term", "storage", "for_partners",
    "location",
    "description", "images", "url",
    "entry_date", "date_added", "date_updated",
    "project_name", "property_tax", "house_committee", "total_floors",
    "contact_name", "parking_spots", "garden_area", "payments_in_year",
    "first_seen_at", "last_seen_at",
    "is_active", "is_hidden"
  ];
  output.push(generateInserts("listings", listings, listingCols));
  
  // Dump price_history
  console.log("Fetching price_history...");
  const priceHistory = await fetchAll("price_history", "observed_at");
  output.push(generateInserts("price_history", priceHistory, [
    "id", "listing_id", "price", "observed_at"
  ]));
  
  // Dump scrape_jobs
  console.log("Fetching scrape_jobs...");
  const scrapeJobs = await fetchAll("scrape_jobs", "started_at");
  output.push(generateInserts("scrape_jobs", scrapeJobs, [
    "id", "status", "started_at", "completed_at",
    "current_region", "current_deal_type", "regions_completed",
    "total_fetched", "total_new", "total_price_drops",
  ]));
  
  const seedPath = resolve(__dirname, "../supabase/seed.sql");
  writeFileSync(seedPath, output.join("\n"), "utf8");
  
  console.log(`\nDone! Seed file written to: supabase/seed.sql`);
  
  // File size
  const { statSync } = await import("fs");
  const stats = statSync(seedPath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
  console.log(`File size: ${sizeMB} MB`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
