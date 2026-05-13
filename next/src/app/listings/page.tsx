import { Suspense } from "react";
import { ListingsClient } from "@/components/listings-client";

export const metadata = { title: "Listings" };

export default function ListingsPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-[#86868b]">Loading...</div>}>
      <ListingsClient key="listings" />
    </Suspense>
  );
}
