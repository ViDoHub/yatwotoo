#!/usr/bin/env python3
"""Sync listings from local MongoDB (restored from Docker backup) to Supabase."""

import os
import sys
import json
import requests
from pymongo import MongoClient

SUPABASE_URL = "https://lpalpyekzrohcjnlpbto.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYWxweWVrenJvaGNqbmxwYnRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODY2OTEwNywiZXhwIjoyMDk0MjQ1MTA3fQ.2GxKhC0vxAJJBJat2BbOHpeeOW8-7awZIN9UovxBE8E"

MONGO_URL = "mongodb://localhost:27017"
MONGO_DB = "yad2search"

BATCH_SIZE = 500

AMENITY_FIELDS = [
    "parking", "elevator", "balcony", "pets_allowed", "air_conditioning",
    "furnished", "accessible", "bars", "boiler", "shelter", "renovated",
    "long_term", "storage", "for_partners"
]


def mongo_to_supabase_row(doc):
    """Convert a MongoDB document to a Supabase row dict."""
    address = doc.get("address") or {}
    amenities = doc.get("amenities") or {}
    location = doc.get("location") or {}
    coords = location.get("coordinates", [None, None])

    # Build PostGIS point if we have coordinates
    location_wkt = None
    if coords and len(coords) == 2 and coords[0] is not None and coords[1] is not None:
        lng, lat = coords[0], coords[1]
        location_wkt = f"SRID=4326;POINT({lng} {lat})"

    row = {
        "yad2_id": doc.get("yad2_id"),
        "deal_type": doc.get("deal_type"),
        "city": address.get("city"),
        "neighborhood": address.get("neighborhood"),
        "street": address.get("street"),
        "house_number": address.get("house_number"),
        "area": address.get("area"),
        "area_id": address.get("area_id"),
        "top_area": address.get("top_area"),
        "top_area_id": address.get("top_area_id"),
        "rooms": doc.get("rooms"),
        "floor": doc.get("floor"),
        "sqm": doc.get("sqm"),
        "price": doc.get("price"),
        "price_per_sqm": doc.get("price_per_sqm"),
        "description": doc.get("description") or "",
        "images": doc.get("images") or [],
        "url": doc.get("url"),
        "entry_date": doc.get("entry_date"),
        "project_name": doc.get("project_name"),
        "first_seen_at": _to_iso(doc.get("first_seen_at")),
        "last_seen_at": _to_iso(doc.get("last_seen_at")),
        "date_added": _to_iso(doc.get("date_added")),
        "date_updated": _to_iso(doc.get("date_updated")),
        "is_active": doc.get("is_active", True),
        "is_hidden": doc.get("is_hidden", False),
        "contact_name": doc.get("contact_name"),
        "garden_area": doc.get("garden_area"),
        "house_committee": doc.get("house_committee"),
        "payments_in_year": doc.get("payments_in_year"),
        "property_tax": doc.get("property_tax"),
        "total_floors": doc.get("total_floors"),
        "parking_spots": doc.get("parking_spots"),
    }

    # Flatten amenities into individual columns
    for field in AMENITY_FIELDS:
        row[field] = amenities.get(field, False)

    # Add location
    if location_wkt:
        row["location"] = location_wkt

    return row


def _to_iso(val):
    """Convert datetime to ISO string."""
    if val is None:
        return None
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def upsert_batch(rows):
    """Upsert a batch of rows to Supabase."""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    url = f"{SUPABASE_URL}/rest/v1/listings?on_conflict=yad2_id"
    resp = requests.post(url, headers=headers, json=rows)
    if resp.status_code not in (200, 201):
        print(f"  ERROR {resp.status_code}: {resp.text[:200]}")
        return False
    return True


def main():
    client = MongoClient(MONGO_URL)
    db = client[MONGO_DB]
    collection = db.listings

    total = collection.count_documents({})
    print(f"Total MongoDB documents: {total}")

    batch = []
    processed = 0
    errors = 0

    for doc in collection.find({}, batch_size=1000):
        row = mongo_to_supabase_row(doc)
        batch.append(row)

        if len(batch) >= BATCH_SIZE:
            if not upsert_batch(batch):
                errors += 1
            processed += len(batch)
            if processed % 5000 == 0:
                print(f"  Processed {processed}/{total} ({100*processed//total}%)")
            batch = []

    # Final batch
    if batch:
        if not upsert_batch(batch):
            errors += 1
        processed += len(batch)

    print(f"Done! Processed {processed} documents, {errors} batch errors.")
    client.close()


if __name__ == "__main__":
    main()
