"use client";

import { Loader2Icon, CheckIcon, XIcon, CircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NodeStatus } from "@/lib/canvas/types";

export function StatusBadge({ status }: { status: NodeStatus }) {
  const map: Record<NodeStatus, { color: string; label: string; Icon: React.ElementType }> = {
    idle: { color: "text-neutral-500", label: "idle", Icon: CircleIcon },
    queued: { color: "text-amber-400", label: "queued", Icon: CircleIcon },
    running: { color: "text-blue-400", label: "running", Icon: Loader2Icon },
    success: { color: "text-emerald-400", label: "success", Icon: CheckIcon },
    failed: { color: "text-red-400", label: "failed", Icon: XIcon },
  };
  const { color, label, Icon } = map[status];
  return (
    <span className={cn("flex items-center gap-1 text-[10px] uppercase", color)}>
      <Icon className={cn("h-3 w-3", status === "running" && "animate-spin")} />
      {label}
    </span>
  );
}

export function NodeShell({
  title,
  status,
  error,
  headerAction,
  children,
  className,
}: {
  title: string;
  status: NodeStatus;
  error?: string | null;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-64 rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-100 shadow-md",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <div className="text-xs font-semibold">{title}</div>
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          {headerAction}
        </div>
      </div>
      <div className="space-y-2 p-3">{children}</div>
      {error && (
        <div className="border-t border-red-900 bg-red-950/40 px-3 py-1.5 text-[11px] text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
