"use client";

import { useState, useCallback, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { BoardColumnComponent } from "./board-column";
import { BoardCard } from "./board-card";
import type { BoardItem } from "./board-card";
import type { BoardColumn } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const COLUMNS: BoardColumn[] = ["review", "get_contacts", "call", "visit"];

export function BoardClient() {
  const [items, setItems] = useState<BoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState<BoardItem | null>(null);

  // Contact dialog state
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BoardItem | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [pendingMove, setPendingMove] = useState<{ itemId: string; toColumn: BoardColumn } | null>(null);

  // Visit dialog state
  const [visitDialogOpen, setVisitDialogOpen] = useState(false);
  const [visitItem, setVisitItem] = useState<BoardItem | null>(null);
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Fetch board data
  const fetchBoard = useCallback(async () => {
    try {
      const resp = await fetch("/api/board");
      const data = await resp.json();
      if (Array.isArray(data)) {
        setItems(data);
      }
    } catch {
      toast.error("Failed to load board");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  // Get items for a specific column, sorted by position
  function getColumnItems(column: BoardColumn): BoardItem[] {
    return items
      .filter((i) => i.board_column === column)
      .sort((a, b) => a.position - b.position);
  }

  // Remove item from board
  async function handleRemove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await fetch(`/api/board/${id}`, { method: "DELETE" });
    toast.success("Removed from board");
  }

  // Open contact edit dialog
  function handleEditContacts(item: BoardItem) {
    setEditingItem(item);
    setContactName(item.contact_name || item.listings.contact_name || "");
    setContactPhone(item.contact_phone || "");
    setPendingMove(null);
    setContactDialogOpen(true);
  }

  // Save contacts
  async function saveContacts() {
    if (!editingItem) return;

    const updates: Record<string, unknown> = {
      contact_name: contactName,
      contact_phone: contactPhone,
    };

    // If there's a pending move, apply the column change too
    if (pendingMove) {
      updates.board_column = pendingMove.toColumn;
    }

    const resp = await fetch(`/api/board/${editingItem.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (resp.ok) {
      const updated = await resp.json();
      setItems((prev) => prev.map((i) => (i.id === editingItem.id ? updated : i)));
      toast.success("Contact info saved");
    } else {
      toast.error("Failed to save contacts");
    }

    setContactDialogOpen(false);
    setEditingItem(null);
    setPendingMove(null);
  }

  // DnD handlers
  function handleDragStart(event: DragStartEvent) {
    const item = items.find((i) => i.id === event.active.id);
    setActiveItem(item || null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeItemData = items.find((i) => i.id === activeId);
    if (!activeItemData) return;

    // Determine target column
    let targetColumn: BoardColumn;
    const overItem = items.find((i) => i.id === overId);

    if (overItem) {
      targetColumn = overItem.board_column;
    } else if (COLUMNS.includes(overId as BoardColumn)) {
      targetColumn = overId as BoardColumn;
    } else {
      return;
    }

    // Move item to new column in state (optimistic)
    if (activeItemData.board_column !== targetColumn) {
      setItems((prev) => {
        const updated = prev.map((i) => {
          if (i.id === activeId) {
            return { ...i, board_column: targetColumn };
          }
          return i;
        });
        return updated;
      });
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveItem(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeItemData = items.find((i) => i.id === activeId);
    if (!activeItemData) return;

    // Determine target column
    let targetColumn: BoardColumn;
    const overItem = items.find((i) => i.id === overId);

    if (overItem) {
      targetColumn = overItem.board_column;
    } else if (COLUMNS.includes(overId as BoardColumn)) {
      targetColumn = overId as BoardColumn;
    } else {
      return;
    }

    // When moving to "get_contacts", open Yad2 page and show contact popup
    if (targetColumn === "get_contacts" && activeItem?.board_column === "review" && !activeItemData.contact_phone) {
      // Open Yad2 listing page
      if (activeItemData.listings.url) {
        window.open(activeItemData.listings.url, "_blank");
      }

      // Open contact dialog with pending move
      setEditingItem(activeItemData);
      setContactName(activeItemData.contact_name || activeItemData.listings.contact_name || "");
      setContactPhone(activeItemData.contact_phone || "");
      setPendingMove({ itemId: activeId, toColumn: "get_contacts" });
      setContactDialogOpen(true);

      // Revert column in state since the move is pending
      setItems((prev) =>
        prev.map((i) => {
          if (i.id === activeId) {
            return { ...i, board_column: activeItemData.board_column };
          }
          return i;
        })
      );
      return;
    }

    // When moving to "visit", open visit dialog for date/time
    if (targetColumn === "visit") {
      setVisitItem(activeItemData);
      // Pre-fill with existing visit_date if any
      if (activeItemData.visit_date) {
        const d = new Date(activeItemData.visit_date);
        setVisitDate(d.toISOString().slice(0, 10));
        setVisitTime(d.toTimeString().slice(0, 5));
      } else {
        setVisitDate("");
        setVisitTime("");
      }
      setVisitDialogOpen(true);

      // Revert column in state since the move is pending
      setItems((prev) =>
        prev.map((i) => {
          if (i.id === activeId) {
            return { ...i, board_column: activeItemData.board_column };
          }
          return i;
        })
      );
      return;
    }

    // Calculate new positions
    const columnItems = items
      .filter((i) => i.board_column === targetColumn && i.id !== activeId)
      .sort((a, b) => a.position - b.position);

    let newIndex: number;
    if (overItem && overItem.id !== activeId) {
      newIndex = columnItems.findIndex((i) => i.id === overId);
      if (newIndex === -1) newIndex = columnItems.length;
    } else {
      newIndex = columnItems.length;
    }

    // Insert active item at the right position
    columnItems.splice(newIndex, 0, { ...activeItemData, board_column: targetColumn } as BoardItem);

    // Build reorder payload
    const reorderItems = columnItems.map((item, idx) => ({
      id: item.id,
      board_column: targetColumn,
      position: idx,
    }));

    // Optimistic update
    setItems((prev) => {
      const updated = [...prev];
      for (const ri of reorderItems) {
        const idx = updated.findIndex((i) => i.id === ri.id);
        if (idx !== -1) {
          updated[idx] = { ...updated[idx], board_column: ri.board_column, position: ri.position };
        }
      }
      return updated;
    });

    // Persist
    await fetch("/api/board/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: reorderItems }),
    });
  }

  async function reorderAfterMove(movedId: string, targetColumn: BoardColumn, overId: string) {
    const columnItems = items
      .filter((i) => i.board_column === targetColumn || i.id === movedId)
      .filter((i) => i.id !== movedId)
      .sort((a, b) => a.position - b.position);

    const overItem = items.find((i) => i.id === overId);
    let newIndex = overItem ? columnItems.findIndex((i) => i.id === overId) : columnItems.length;
    if (newIndex === -1) newIndex = columnItems.length;

    const movedItem = items.find((i) => i.id === movedId);
    if (movedItem) {
      columnItems.splice(newIndex, 0, { ...movedItem, board_column: targetColumn });
    }

    const reorderPayload = columnItems.map((item, idx) => ({
      id: item.id,
      board_column: targetColumn,
      position: idx,
    }));

    if (reorderPayload.length > 0) {
      await fetch("/api/board/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: reorderPayload }),
      });
    }
  }

  // Save visit date and move to visit column
  async function saveVisit() {
    if (!visitItem) return;

    const visitDateTime = visitDate && visitTime
      ? new Date(`${visitDate}T${visitTime}`).toISOString()
      : visitDate
        ? new Date(`${visitDate}T09:00`).toISOString()
        : null;

    const resp = await fetch(`/api/board/${visitItem.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        board_column: "visit",
        visit_date: visitDateTime,
      }),
    });

    if (resp.ok) {
      const updated = await resp.json();
      setItems((prev) => prev.map((i) => (i.id === visitItem.id ? updated : i)));
      toast.success("Visit scheduled");
    } else {
      toast.error("Failed to schedule visit");
    }

    setVisitDialogOpen(false);
    setVisitItem(null);
  }

  // Edit visit date for an existing visit item
  function handleEditVisit(item: BoardItem) {
    setVisitItem(item);
    if (item.visit_date) {
      const d = new Date(item.visit_date);
      setVisitDate(d.toISOString().slice(0, 10));
      setVisitTime(d.toTimeString().slice(0, 5));
    } else {
      setVisitDate("");
      setVisitTime("");
    }
    setVisitDialogOpen(true);
  }

  // Generate Google Calendar URL
  function getGoogleCalendarUrl(item: BoardItem): string {
    const listing = item.listings;
    const address = [listing.street, listing.house_number, listing.city].filter(Boolean).join(" ");
    const title = `Visit: ${address}`;

    let startDate: string;
    let endDate: string;
    if (item.visit_date) {
      const d = new Date(item.visit_date);
      const fmt = (dt: Date) => dt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      startDate = fmt(d);
      const end = new Date(d.getTime() + 60 * 60 * 1000); // 1 hour
      endDate = fmt(end);
    } else {
      const d = new Date();
      d.setHours(d.getHours() + 1, 0, 0, 0);
      const fmt = (dt: Date) => dt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      startDate = fmt(d);
      const end = new Date(d.getTime() + 60 * 60 * 1000);
      endDate = fmt(end);
    }

    const details = [
      listing.price ? `Price: ₪${listing.price.toLocaleString()}` : "",
      listing.rooms ? `Rooms: ${listing.rooms}` : "",
      listing.sqm ? `Size: ${listing.sqm} m²` : "",
      item.contact_name ? `Contact: ${item.contact_name}` : "",
      item.contact_phone ? `Phone: ${item.contact_phone}` : "",
    ].filter(Boolean).join("\n");

    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: title,
      dates: `${startDate}/${endDate}`,
      details,
      location: address,
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {COLUMNS.map((col) => (
          <div key={col} className="min-w-[260px] w-[260px] shrink-0">
            <div className="h-10 bg-[#f5f5f7] rounded-t-xl animate-pulse" />
            <div className="h-32 bg-[#fafafa] rounded-b-xl border border-t-0 border-black/[0.04]" />
          </div>
        ))}
      </div>
    );
  }

  const totalItems = items.length;

  return (
    <>
      {totalItems === 0 ? (
        <div className="text-center py-10 text-[0.8125rem] text-[#86868b]">
          <div className="text-2xl mb-2">❤️</div>
          <p>No listings on the board yet.</p>
          <p className="text-[0.75rem] mt-1">Like listings from the Listings page to add them here.</p>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            {COLUMNS.map((column) => (
              <BoardColumnComponent
                key={column}
                column={column}
                items={getColumnItems(column)}
                onRemove={handleRemove}
                onEditContacts={handleEditContacts}
                onEditVisit={handleEditVisit}
                onCalendarSync={getGoogleCalendarUrl}
              />
            ))}

            <DragOverlay>
              {activeItem ? (
                <div className="rotate-2 scale-105">
                  <BoardCard
                    item={activeItem}
                    onRemove={() => {}}
                    onEditContacts={() => {}}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* Visit Dialog */}
      <Dialog open={visitDialogOpen} onOpenChange={setVisitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Visit</DialogTitle>
            <DialogDescription>
              Set the date and time for your property visit.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 py-2">
            <div className="flex-1">
              <label className="text-[0.75rem] font-medium text-[#86868b] mb-1 block">Date</label>
              <Input
                type="date"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="text-[0.75rem] font-medium text-[#86868b] mb-1 block">Time</label>
              <Input
                type="time"
                value={visitTime}
                onChange={(e) => setVisitTime(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setVisitDialogOpen(false);
                setVisitItem(null);
              }}
            >
              Cancel
            </Button>
            {visitDate && visitItem && (
              <a
                href={getGoogleCalendarUrl({
                  ...visitItem,
                  visit_date: visitDate && visitTime
                    ? new Date(`${visitDate}T${visitTime}`).toISOString()
                    : visitDate
                      ? new Date(`${visitDate}T09:00`).toISOString()
                      : visitItem.visit_date,
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium h-8 px-3 border border-[#4285f4] text-[#4285f4] hover:bg-[#4285f4]/5 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                  <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2" />
                </svg>
                Sync to Google Calendar
              </a>
            )}
            <Button
              onClick={saveVisit}
              className="bg-[#0071e3] hover:bg-[#0077ed] text-white"
            >
              Save Visit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contact Info Dialog */}
      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contact Information</DialogTitle>
            <DialogDescription>
              {pendingMove
                ? "Enter the contact details from the Yad2 listing page."
                : "Add or edit contact details for this listing."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-[0.75rem] font-medium text-[#86868b] mb-1 block">Name</label>
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Contact name"
              />
            </div>
            <div>
              <label className="text-[0.75rem] font-medium text-[#86868b] mb-1 block">
                Phone
              </label>
              <Input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="Phone number"
                type="tel"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setContactDialogOpen(false);
                setPendingMove(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={saveContacts}
              className="bg-[#0071e3] hover:bg-[#0077ed] text-white"
            >
              {pendingMove ? "Save & Move" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
