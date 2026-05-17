/**
 * Database types — manually defined to match supabase/schema.sql.
 * Replace with auto-generated types via `npx supabase gen types typescript`
 * once the Supabase project is created.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      listings: {
        Row: {
          id: string;
          yad2_id: string;
          deal_type: string;
          city: string;
          neighborhood: string;
          street: string;
          house_number: string;
          area: string;
          area_id: number;
          top_area: string;
          top_area_id: number;
          rooms: number | null;
          floor: number | null;
          sqm: number | null;
          price: number | null;
          price_per_sqm: number | null;
          parking: boolean | null;
          elevator: boolean | null;
          balcony: boolean | null;
          pets_allowed: boolean | null;
          air_conditioning: boolean | null;
          furnished: boolean | null;
          accessible: boolean | null;
          bars: boolean | null;
          boiler: boolean | null;
          shelter: boolean | null;
          renovated: boolean | null;
          long_term: boolean | null;
          storage: boolean | null;
          for_partners: boolean | null;
          location: unknown | null;
          description: string;
          images: string[];
          url: string;
          entry_date: string;
          date_added: string;
          date_updated: string;
          project_name: string;
          property_tax: string;
          house_committee: string;
          total_floors: number | null;
          contact_name: string;
          parking_spots: number | null;
          garden_area: number | null;
          payments_in_year: number | null;
          first_seen_at: string;
          last_seen_at: string;
          is_active: boolean;
          is_hidden: boolean;
        };
        Insert: {
          id?: string;
          yad2_id: string;
          deal_type?: string;
          city?: string;
          neighborhood?: string;
          street?: string;
          house_number?: string;
          area?: string;
          area_id?: number;
          top_area?: string;
          top_area_id?: number;
          rooms?: number | null;
          floor?: number | null;
          sqm?: number | null;
          price?: number | null;
          price_per_sqm?: number | null;
          parking?: boolean | null;
          elevator?: boolean | null;
          balcony?: boolean | null;
          pets_allowed?: boolean | null;
          air_conditioning?: boolean | null;
          furnished?: boolean | null;
          accessible?: boolean | null;
          bars?: boolean | null;
          boiler?: boolean | null;
          shelter?: boolean | null;
          renovated?: boolean | null;
          long_term?: boolean | null;
          storage?: boolean | null;
          for_partners?: boolean | null;
          location?: unknown | null;
          description?: string;
          images?: string[];
          url?: string;
          entry_date?: string;
          date_added?: string;
          date_updated?: string;
          project_name?: string;
          property_tax?: string;
          house_committee?: string;
          total_floors?: number | null;
          contact_name?: string;
          parking_spots?: number | null;
          garden_area?: number | null;
          payments_in_year?: number | null;
          first_seen_at?: string;
          last_seen_at?: string;
          is_active?: boolean;
          is_hidden?: boolean;
        };
        Update: {
          id?: string;
          yad2_id?: string;
          deal_type?: string;
          city?: string;
          neighborhood?: string;
          street?: string;
          house_number?: string;
          area?: string;
          area_id?: number;
          top_area?: string;
          top_area_id?: number;
          rooms?: number | null;
          floor?: number | null;
          sqm?: number | null;
          price?: number | null;
          price_per_sqm?: number | null;
          parking?: boolean | null;
          elevator?: boolean | null;
          balcony?: boolean | null;
          pets_allowed?: boolean | null;
          air_conditioning?: boolean | null;
          furnished?: boolean | null;
          accessible?: boolean | null;
          bars?: boolean | null;
          boiler?: boolean | null;
          shelter?: boolean | null;
          renovated?: boolean | null;
          long_term?: boolean | null;
          storage?: boolean | null;
          for_partners?: boolean | null;
          location?: unknown | null;
          description?: string;
          images?: string[];
          url?: string;
          entry_date?: string;
          date_added?: string;
          date_updated?: string;
          project_name?: string;
          property_tax?: string;
          house_committee?: string;
          total_floors?: number | null;
          contact_name?: string;
          parking_spots?: number | null;
          garden_area?: number | null;
          payments_in_year?: number | null;
          first_seen_at?: string;
          last_seen_at?: string;
          is_active?: boolean;
          is_hidden?: boolean;
        };
        Relationships: [];
      };
      saved_searches: {
        Row: {
          id: string;
          name: string;
          filters: Json;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          filters?: Json;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          filters?: Json;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      price_history: {
        Row: {
          id: string;
          listing_id: string;
          price: number;
          observed_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          price: number;
          observed_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string;
          price?: number;
          observed_at?: string;
        };
        Relationships: [];
      };
      notification_logs: {
        Row: {
          id: string;
          saved_search_id: string;
          listing_id: string;
          message_type: string;
          sent_at: string;
        };
        Insert: {
          id?: string;
          saved_search_id: string;
          listing_id: string;
          message_type: string;
          sent_at?: string;
        };
        Update: {
          id?: string;
          saved_search_id?: string;
          listing_id?: string;
          message_type?: string;
          sent_at?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          id: string;
          whatsapp_enabled: boolean;
          whatsapp_phone: string;
          whatsapp_apikey: string;
          telegram_enabled: boolean;
          telegram_bot_token: string;
          telegram_chat_id: string;
          email_enabled: boolean;
          email_smtp_host: string;
          email_smtp_port: number;
          email_smtp_user: string;
          email_smtp_password: string;
          email_to: string;
          poll_interval_minutes: number;
          notifications_enabled: boolean;
        };
        Insert: {
          id?: string;
          whatsapp_enabled?: boolean;
          whatsapp_phone?: string;
          whatsapp_apikey?: string;
          telegram_enabled?: boolean;
          telegram_bot_token?: string;
          telegram_chat_id?: string;
          email_enabled?: boolean;
          email_smtp_host?: string;
          email_smtp_port?: number;
          email_smtp_user?: string;
          email_smtp_password?: string;
          email_to?: string;
          poll_interval_minutes?: number;
          notifications_enabled?: boolean;
        };
        Update: {
          id?: string;
          whatsapp_enabled?: boolean;
          whatsapp_phone?: string;
          whatsapp_apikey?: string;
          telegram_enabled?: boolean;
          telegram_bot_token?: string;
          telegram_chat_id?: string;
          email_enabled?: boolean;
          email_smtp_host?: string;
          email_smtp_port?: number;
          email_smtp_user?: string;
          email_smtp_password?: string;
          email_to?: string;
          poll_interval_minutes?: number;
          notifications_enabled?: boolean;
        };
        Relationships: [];
      };
      scrape_jobs: {
        Row: {
          id: string;
          status: string;
          started_at: string;
          completed_at: string | null;
          current_region: number | null;
          current_deal_type: string | null;
          regions_completed: string[];
          total_fetched: number;
          total_new: number;
          total_price_drops: number;
          error: string | null;
        };
        Insert: {
          id?: string;
          status?: string;
          started_at?: string;
          completed_at?: string | null;
          current_region?: number | null;
          current_deal_type?: string | null;
          regions_completed?: string[];
          total_fetched?: number;
          total_new?: number;
          total_price_drops?: number;
          error?: string | null;
        };
        Update: {
          id?: string;
          status?: string;
          started_at?: string;
          completed_at?: string | null;
          current_region?: number | null;
          current_deal_type?: string | null;
          regions_completed?: string[];
          total_fetched?: number;
          total_new?: number;
          total_price_drops?: number;
          error?: string | null;
        };
        Relationships: [];
      };
      board_listings: {
        Row: {
          id: string;
          listing_id: string;
          board_column: string;
          position: number;
          contact_name: string;
          contact_phone: string;
          visit_date: string | null;
          notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          board_column?: string;
          position?: number;
          contact_name?: string;
          contact_phone?: string;
          visit_date?: string | null;
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string;
          board_column?: string;
          position?: number;
          contact_name?: string;
          contact_phone?: string;
          visit_date?: string | null;
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      listings_in_bbox: {
        Args: {
          south: number;
          west: number;
          north: number;
          east: number;
        };
        Returns: Database["public"]["Tables"]["listings"]["Row"][];
      };
      listings_near_point: {
        Args: {
          lat: number;
          lng: number;
          radius_km: number;
        };
        Returns: Database["public"]["Tables"]["listings"]["Row"][];
      };
    };
  };
}
