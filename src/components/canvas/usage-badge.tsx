"use client";

import { ClockIcon, SparklesIcon } from "lucide-react";
import { IMAGE_MODELS } from "@/lib/apimart/models";
import type { NodeStatus, NodeUsage } from "@/lib/canvas/types";

export function UsageBadge({
  usage,
  status,
}: {
  usage: NodeUsage | null;
  status?: NodeStatus;
}) {
  // Hide on failed/idle — the badge represents what was used to produce a
  // current output, so showing the (stale) failed model name after the user
  // already picked a new one in the dropdown is misleading.
  if (status && status !== "success") return null;
  if (!usage || (!usage.model && !usage.actualTime)) return null;
  const modelLabel =
    IMAGE_MODELS.find((m) => m.id === usage.model)?.label ?? usage.model;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-950/60 px-2 py-1 text-[10px] text-neutral-600 dark:text-neutral-400">
      {modelLabel && (
        <span className="flex items-center gap-1">
          <SparklesIcon className="h-3 w-3" />
          {modelLabel}
        </span>
      )}
      {typeof usage.actualTime === "number" && (
        <span className="flex items-center gap-1">
          <ClockIcon className="h-3 w-3" />
          {usage.actualTime.toFixed(1)}s
        </span>
      )}
    </div>
  );
}
