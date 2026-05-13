"use client";

import { Suspense } from "react";
import { ListingsClient } from "@/components/listings-client";

export default function HiddenListingsPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-[#86868b]">Loading...</div>}>
      <ListingsClient key="hidden" hiddenMode />
    </Suspense>
  );
}
