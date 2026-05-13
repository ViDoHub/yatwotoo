"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { SavedSearch, NotificationLog } from "@/types";

interface DashboardStats {
  total: number;
  rent: number;
  forsale: number;
  hidden: number;
  searches: number;
}

interface DashboardClientProps {
  stats: DashboardStats;
  savedSearches: SavedSearch[];
  recentNotifications: NotificationLog[];
}

export function DashboardClient({ stats, savedSearches, recentNotifications }: DashboardClientProps) {
  const [scraping, setScraping] = useState(false);
  const [scrapeStatus, setStatus] = useState("Ready");
  const [progress, setProgress] = useState("");

  async function startScrape() {
    setScraping(true);
    setStatus("Starting...");
    setProgress("");

    try {
      const resp = await fetch("/api/scrape/start", { method: "POST" });
      const data = await resp.json();

      if (resp.status === 409) {
        setStatus("Already running");
        toast.info("A scrape is already running");
        setScraping(false);
        return;
      }

      setStatus("Running...");
      pollStatus();
    } catch {
      setStatus("Error");
      toast.error("Failed to start scrape");
      setScraping(false);
    }
  }

  async function pollStatus() {
    const interval = setInterval(async () => {
      try {
        const resp = await fetch("/api/scrape/status");
        const data = await resp.json();
        const job = data.job;

        if (!job) {
          clearInterval(interval);
          setScraping(false);
          return;
        }

        setProgress(`${job.progress_pct}% — ${job.regions_completed}/${job.total_steps} steps`);

        if (job.status === "completed") {
          clearInterval(interval);
          setStatus("Completed");
          setProgress(`Fetched ${job.total_fetched}, ${job.total_new} new, ${job.total_price_drops} price drops`);
          toast.success("Scrape completed!");
          setScraping(false);
        } else if (job.status === "failed") {
          clearInterval(interval);
          setStatus("Failed");
          setProgress(job.error || "Unknown error");
          toast.error("Scrape failed");
          setScraping(false);
        }
      } catch {
        clearInterval(interval);
        setScraping(false);
      }
    }, 5000);
  }

  return (
    <div dir="ltr">
      {/* Scrape Control */}
      <Card className="mb-6">
        <CardContent className="flex items-center justify-between p-5">
          <div>
            <div className="text-sm font-medium text-[#1d1d1f]">{scrapeStatus}</div>
            <div className="text-xs text-[#86868b] mt-0.5">
              {progress || 'Click "Update Data" to scrape all regions'}
            </div>
          </div>
          <Button
            onClick={startScrape}
            disabled={scraping}
            className="bg-[#0071e3] hover:bg-[#0077ed] text-white text-[0.8125rem] font-medium rounded-[10px] px-5"
          >
            {scraping ? "Scraping..." : "Update Data"}
          </Button>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard value={stats.total} label="Active Listings" color="#0071e3" />
        <StatCard value={stats.rent} label="Rent" color="#ff9500" />
        <StatCard value={stats.forsale} label="For Sale" color="#34c759" />
        <StatCard value={stats.searches} label="Saved Searches" color="#af52de" />
      </div>

      {/* Hidden Listings Banner */}
      {stats.hidden > 0 && (
        <Link href="/listings?hidden=true" className="block mb-6 no-underline">
          <div className="bg-[#fff8e1] border border-[#ffe082] rounded-2xl px-6 py-4 flex items-center gap-3 hover:bg-[#fff3c4] transition-colors">
            <span className="text-sm font-semibold text-[#f57f17]">
              {stats.hidden} Hidden Listing{stats.hidden !== 1 ? "s" : ""}
            </span>
            <span className="text-xs text-[#f9a825]">Click to view and unhide</span>
          </div>
        </Link>
      )}

      {/* Saved Searches */}
      <Card>
        <div className="p-5 border-b border-black/[0.04]">
          <h2 className="text-[0.9375rem] font-semibold text-[#1d1d1f]">Saved Searches</h2>
        </div>
        <CardContent className="p-4">
          {savedSearches.length > 0 ? (
            <div className="space-y-2">
              {savedSearches.map((search) => (
                <SavedSearchItem key={search.id} search={search} />
              ))}
            </div>
          ) : (
            <p className="text-center py-8 text-[0.8125rem] text-[#86868b]">
              No saved searches yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Recent Notifications */}
      <Card className="mt-6">
        <div className="p-5 border-b border-black/[0.04]">
          <h2 className="text-[0.9375rem] font-semibold text-[#1d1d1f]">Recent Notifications</h2>
        </div>
        <CardContent className="p-4">
          {recentNotifications.length > 0 ? (
            <div className="space-y-1">
              {recentNotifications.map((notif) => (
                <div key={notif.id} className="flex items-center justify-between text-[0.8125rem] py-2.5 border-b border-black/[0.04] last:border-0">
                  <div>
                    <span className={`font-medium ${notif.message_type === "price_drop" ? "text-[#34c759]" : "text-[#0071e3]"}`}>
                      {notif.message_type === "price_drop" ? "Price Drop" : "New Listing"}
                    </span>
                    <Link href={`/listings/${notif.listing_id}`} className="text-[#86868b] no-underline ml-2 hover:text-[#1d1d1f]">
                      {notif.listing_id}
                    </Link>
                  </div>
                  <span className="text-[0.75rem] text-[#aeaeb2]">
                    {new Date(notif.sent_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" })}{" "}
                    {new Date(notif.sent_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-8 text-[0.8125rem] text-[#86868b]">
              No notifications yet
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="text-3xl font-semibold tracking-tight" style={{ color }}>
          {value.toLocaleString()}
        </div>
        <div className="text-xs text-[#86868b] mt-1">{label}</div>
      </CardContent>
    </Card>
  );
}

function SavedSearchItem({ search }: { search: SavedSearch }) {
  const f = (search.filters ?? {}) as Record<string, unknown>;
  const params = new URLSearchParams();

  if (f.deal_type) params.set("deal_type", String(f.deal_type));
  if (Array.isArray(f.cities)) params.set("cities", f.cities.join(","));
  if (Array.isArray(f.top_area_ids)) params.set("top_area_ids", f.top_area_ids.join(","));
  if (f.rooms_min) params.set("rooms_min", String(f.rooms_min));
  if (f.rooms_max) params.set("rooms_max", String(f.rooms_max));
  if (f.price_min) params.set("price_min", String(f.price_min));
  if (f.price_max) params.set("price_max", String(f.price_max));
  params.set("search_id", search.id);

  const dealType = String(f.deal_type ?? "rent");

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await fetch(`/api/searches/${search.id}`, { method: "DELETE" });
    toast.success("Search deleted");
    window.location.reload();
  }

  return (
    <div className="flex items-center justify-between p-3.5 bg-[#f5f5f7] rounded-xl">
      <Link href={`/listings?${params.toString()}`} className="flex-1 no-underline text-inherit">
        <div className="text-sm font-medium text-[#1d1d1f]">{search.name}</div>
        <div className="text-xs text-[#86868b] mt-0.5">
          <span className={dealType === "forsale" ? "text-[#34c759]" : "text-[#0071e3]"}>
            {dealType === "forsale" ? "Buy" : "Rent"}
          </span>
          {f.city ? <> · {String(f.city)}</> : null}
          {Array.isArray(f.cities) ? <> · {(f.cities as string[]).join(", ")}</> : null}
          {(f.rooms_min || f.rooms_max) ? (
            <> · {String(f.rooms_min ?? "")}-{String(f.rooms_max ?? "")} rooms</>
          ) : null}
          {(f.price_min || f.price_max) ? (
            <> · {String(f.price_min ?? "")}-{String(f.price_max ?? "")} ₪</>
          ) : null}
        </div>
      </Link>
      <button
        onClick={handleDelete}
        className="text-xs font-medium text-[#ff3b30] bg-transparent border-none cursor-pointer px-2 py-1 rounded-md hover:bg-[#fff0f0] transition-colors ml-2"
      >
        Delete
      </button>
    </div>
  );
}
