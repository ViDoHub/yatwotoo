"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface Settings {
  notifications_enabled: boolean;
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
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    notifications_enabled: false,
    whatsapp_enabled: false,
    whatsapp_phone: "",
    whatsapp_apikey: "",
    telegram_enabled: false,
    telegram_bot_token: "",
    telegram_chat_id: "",
    email_enabled: false,
    email_smtp_host: "",
    email_smtp_port: 587,
    email_smtp_user: "",
    email_smtp_password: "",
    email_to: "",
    poll_interval_minutes: 15,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.settings) setSettings(data.settings);
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const resp = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (resp.ok) {
        toast.success("Settings saved");
      } else {
        toast.error("Failed to save settings");
      }
    } finally {
      setSaving(false);
    }
  }

  async function testChannel(channel: string) {
    const resp = await fetch(`/api/settings/test/${channel}`, { method: "POST" });
    const data = await resp.json();
    if (data.success) {
      toast.success(`${channel} test sent!`);
    } else {
      toast.error(`${channel} test failed`);
    }
  }

  function update(key: keyof Settings, value: unknown) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) {
    return <div className="text-center py-12 text-[#86868b]">Loading settings...</div>;
  }

  return (
    <div dir="ltr" className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[#1d1d1f]">Settings</h1>

      {/* General */}
      <Card>
        <CardContent className="p-6 space-y-5">
          <h2 className="text-xs font-semibold tracking-wider uppercase text-[#86868b]">General</h2>
          <div className="flex items-center justify-between bg-[#f9f9fb] rounded-xl px-4 py-3">
            <div>
              <div className="text-sm font-medium">Notifications</div>
              <div className="text-xs text-[#86868b]">Global kill switch for all channels</div>
            </div>
            <Switch
              checked={settings.notifications_enabled}
              onCheckedChange={(v) => update("notifications_enabled", v)}
            />
          </div>
          <div>
            <div className="text-sm font-medium mb-1">Poll interval (minutes)</div>
            <Input
              type="number"
              value={settings.poll_interval_minutes}
              onChange={(e) => update("poll_interval_minutes", Number(e.target.value))}
            />
            <p className="text-xs text-[#86868b] mt-1">How often to check for new listings (minimum 5)</p>
          </div>
          <Button onClick={save} disabled={saving} className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-[10px]">
            {saving ? "Saving..." : "Save"}
          </Button>
        </CardContent>
      </Card>

      {/* WhatsApp */}
      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wider uppercase text-[#86868b]">WhatsApp Notifications</h2>
            <Switch
              checked={settings.whatsapp_enabled}
              onCheckedChange={(v) => update("whatsapp_enabled", v)}
            />
          </div>
          {settings.whatsapp_enabled && (
            <>
              <div className="bg-[#f9f9fb] rounded-xl px-4 py-3 space-y-1">
                <p className="text-sm font-medium">Setup (Callmebot):</p>
                <ol className="text-xs text-[#86868b] list-decimal list-inside space-y-0.5">
                  <li>Send a message to <strong className="text-[#1d1d1f]">+34 644 51 95 23</strong> on WhatsApp:</li>
                  <li><code className="bg-[#e8e8ed] px-1 rounded">I allow callmebot to send me messages</code></li>
                  <li>You will receive a reply with your API key</li>
                  <li>Enter your phone number and API key below</li>
                </ol>
              </div>
              <div>
                <div className="text-sm font-medium mb-1">Phone number (with country code)</div>
                <Input
                  placeholder="972501234567"
                  value={settings.whatsapp_phone}
                  onChange={(e) => update("whatsapp_phone", e.target.value)}
                />
                <p className="text-xs text-[#86868b] mt-1">Example: 972501234567 (without + or leading 0)</p>
              </div>
              <div>
                <div className="text-sm font-medium mb-1">API Key</div>
                <Input
                  placeholder="123456"
                  value={settings.whatsapp_apikey}
                  onChange={(e) => update("whatsapp_apikey", e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <Button onClick={save} disabled={saving} className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-[10px]">
                  {saving ? "Saving..." : "Save"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => testChannel("whatsapp")}>
                  Send Test
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Telegram */}
      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wider uppercase text-[#86868b]">Telegram Notifications</h2>
            <Switch
              checked={settings.telegram_enabled}
              onCheckedChange={(v) => update("telegram_enabled", v)}
            />
          </div>
          {settings.telegram_enabled && (
            <>
              <div className="bg-[#f9f9fb] rounded-xl px-4 py-3 space-y-1">
                <p className="text-sm font-medium">Setup:</p>
                <ol className="text-xs text-[#86868b] list-decimal list-inside space-y-0.5">
                  <li>Message <strong className="text-[#1d1d1f]">@BotFather</strong> on Telegram to create a bot</li>
                  <li>Copy the bot token</li>
                  <li>Start a chat with your bot, then get your chat ID via <strong className="text-[#1d1d1f]">@userinfobot</strong></li>
                </ol>
              </div>
              <div>
                <div className="text-sm font-medium mb-1">Bot Token</div>
                <Input
                  placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                  value={settings.telegram_bot_token}
                  onChange={(e) => update("telegram_bot_token", e.target.value)}
                />
              </div>
              <div>
                <div className="text-sm font-medium mb-1">Chat ID</div>
                <Input
                  placeholder="123456789"
                  value={settings.telegram_chat_id}
                  onChange={(e) => update("telegram_chat_id", e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <Button onClick={save} disabled={saving} className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-[10px]">
                  {saving ? "Saving..." : "Save"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => testChannel("telegram")}>
                  Send Test
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Email */}
      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wider uppercase text-[#86868b]">Email Notifications</h2>
            <Switch
              checked={settings.email_enabled}
              onCheckedChange={(v) => update("email_enabled", v)}
            />
          </div>
          {settings.email_enabled && (
            <>
              <div className="bg-[#f9f9fb] rounded-xl px-4 py-3 space-y-1">
                <p className="text-sm font-medium">SMTP Setup:</p>
                <p className="text-xs text-[#86868b]">
                  For Gmail: use <strong className="text-[#1d1d1f]">smtp.gmail.com</strong> port <strong className="text-[#1d1d1f]">587</strong> with an{" "}
                  <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-[#0071e3] underline">
                    App Password
                  </a>{" "}
                  (requires 2FA enabled).
                </p>
              </div>
              <div>
                <div className="text-sm font-medium mb-1">SMTP Host</div>
                <Input
                  placeholder="smtp.gmail.com"
                  value={settings.email_smtp_host}
                  onChange={(e) => update("email_smtp_host", e.target.value)}
                />
              </div>
              <div>
                <div className="text-sm font-medium mb-1">SMTP Port</div>
                <Input
                  type="number"
                  placeholder="587"
                  value={settings.email_smtp_port || ""}
                  onChange={(e) => update("email_smtp_port", Number(e.target.value))}
                />
                <p className="text-xs text-[#86868b] mt-1">587 (STARTTLS) or 465 (SSL)</p>
              </div>
              <div>
                <div className="text-sm font-medium mb-1">Username</div>
                <Input
                  placeholder="you@gmail.com"
                  value={settings.email_smtp_user}
                  onChange={(e) => update("email_smtp_user", e.target.value)}
                />
              </div>
              <div>
                <div className="text-sm font-medium mb-1">Password</div>
                <Input
                  type="password"
                  placeholder="App password"
                  value={settings.email_smtp_password}
                  onChange={(e) => update("email_smtp_password", e.target.value)}
                />
              </div>
              <div>
                <div className="text-sm font-medium mb-1">Recipient Email</div>
                <Input
                  placeholder="you@gmail.com"
                  value={settings.email_to}
                  onChange={(e) => update("email_to", e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <Button onClick={save} disabled={saving} className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-[10px]">
                  {saving ? "Saving..." : "Save"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => testChannel("email")}>
                  Send Test
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardContent className="p-6 space-y-3">
          <h2 className="text-xs font-semibold tracking-wider uppercase text-[#86868b]">About</h2>
          <p className="text-sm text-[#1d1d1f]">This app automatically checks Yad2 for new listings and sends notifications via your chosen channels.</p>
          <p className="text-sm text-[#1d1d1f]">Create saved searches with custom filters to receive alerts only for matching apartments.</p>
          <p className="text-sm font-medium text-[#1d1d1f]">Notification types:</p>
          <ul className="text-sm text-[#1d1d1f] list-disc list-inside space-y-1">
            <li>New listing matching a saved search</li>
            <li>Price drop on a listing in a saved search</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
