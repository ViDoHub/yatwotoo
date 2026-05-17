"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { BoardCard } from "./board-card";
import type { BoardItem } from "./board-card";
import type { BoardColumn } from "@/types";

const COLUMN_CONFIG: Record<BoardColumn, { title: string; icon: string; color: string; bgColor: string }> = {
  review: { title: "Review", icon: "❤️", color: "text-[#ff3b30]", bgColor: "bg-[#fff5f5]" },
  get_contacts: { title: "Get Contacts", icon: "📇", color: "text-[#ff9500]", bgColor: "bg-[#fff8ee]" },
  call: { title: "Call", icon: "📞", color: "text-[#34c759]", bgColor: "bg-[#f0fdf4]" },
  visit: { title: "Visit", icon: "🏠", color: "text-[#0071e3]", bgColor: "bg-[#eef6ff]" },
};

interface BoardColumnProps {
  column: BoardColumn;
  items: BoardItem[];
  onRemove: (id: string) => void;
  onEditContacts: (item: BoardItem) => void;
  onEditVisit: (item: BoardItem) => void;
  onCalendarSync: (item: BoardItem) => string;
}

export function BoardColumnComponent({ column, items, onRemove, onEditContacts, onEditVisit, onCalendarSync }: BoardColumnProps) {
  const config = COLUMN_CONFIG[column];
  const { setNodeRef, isOver } = useDroppable({ id: column });

  return (
    <div className="flex flex-col min-w-[260px] w-[260px] shrink-0">
      {/* Column Header */}
      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-t-xl ${config.bgColor}`}>
        <span className="text-base">{config.icon}</span>
        <h3 className={`text-[0.8125rem] font-semibold ${config.color}`}>{config.title}</h3>
        <span className="text-[0.6875rem] text-[#86868b] ml-auto bg-white/60 px-1.5 py-0.5 rounded-full font-medium">
          {items.length}
        </span>
      </div>

      {/* Column Body */}
      <div
        ref={setNodeRef}
        className={`flex-1 p-2 space-y-2 rounded-b-xl border border-t-0 transition-colors min-h-[120px] ${
          isOver
            ? "border-[#0071e3]/30 bg-[#0071e3]/[0.03]"
            : "border-black/[0.04] bg-[#fafafa]"
        }`}
      >
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <BoardCard
              key={item.id}
              item={item}
              onRemove={onRemove}
              onEditContacts={onEditContacts}
              onEditVisit={onEditVisit}
              onCalendarSync={onCalendarSync}
            />
          ))}
        </SortableContext>
        {items.length === 0 && (
          <div className="flex items-center justify-center h-20 text-[0.75rem] text-[#aeaeb2]">
            Drop listings here
          </div>
        )}
      </div>
    </div>
  );
}
