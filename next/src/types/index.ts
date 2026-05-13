import type { Database } from "./database";

// Convenience type aliases
export type Listing = Database["public"]["Tables"]["listings"]["Row"];
export type ListingInsert = Database["public"]["Tables"]["listings"]["Insert"];
export type ListingUpdate = Database["public"]["Tables"]["listings"]["Update"];

export type SavedSearch = Database["public"]["Tables"]["saved_searches"]["Row"];
export type PriceHistory = Database["public"]["Tables"]["price_history"]["Row"];
export type NotificationLog = Database["public"]["Tables"]["notification_logs"]["Row"];
export type UserSettings = Database["public"]["Tables"]["user_settings"]["Row"];
export type ScrapeJob = Database["public"]["Tables"]["scrape_jobs"]["Row"];

// Enums
export type DealType = "rent" | "forsale" | "newprojects";

export type JobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "resumed";

export type MessageType = "new_listing" | "price_drop";

// Amenity keys (for filter UI)
export const AMENITY_KEYS = [
  "parking",
  "elevator",
  "balcony",
  "pets_allowed",
  "air_conditioning",
  "furnished",
  "shelter",
  "renovated",
  "long_term",
  "storage",
  "for_partners",
] as const;

export type AmenityKey = (typeof AMENITY_KEYS)[number];
