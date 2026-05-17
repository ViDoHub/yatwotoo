"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { createBrowserClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/listings", label: "Listings" },
  { href: "/settings", label: "Settings" },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const supabase = createBrowserClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <nav className="sticky top-0 z-50 bg-white/72 backdrop-blur-xl border-b border-black/[0.04]">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        <Link
          href="/"
          className="text-base font-semibold tracking-tight text-[#1d1d1f] no-underline flex items-center gap-2"
        >
          <Image src="/icon.svg" alt="YaTwoToo" width={28} height={28} />
          YaTwoToo
        </Link>
        <div className="flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => {
            const isActive =
              href === "/"
                ? pathname === "/"
                : pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "text-[0.8125rem] font-[450] text-[#86868b] no-underline px-3 py-1.5 rounded-lg transition-all duration-150",
                  "hover:text-[#1d1d1f] hover:bg-black/[0.04]",
                  isActive && "text-[#0071e3] bg-[#0071e3]/[0.06]"
                )}
              >
                {label}
              </Link>
            );
          })}
          {user && (
            <button
              onClick={handleLogout}
              className="text-[0.8125rem] font-[450] text-[#86868b] px-3 py-1.5 rounded-lg transition-all duration-150 hover:text-[#1d1d1f] hover:bg-black/[0.04] ml-2"
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
