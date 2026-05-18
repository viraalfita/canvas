"use client";

import { NodeResizer } from "@xyflow/react";

/**
 * Thin wrapper around React Flow's NodeResizer with our visual style: emerald
 * border + subtle handles, only visible when the node is selected.
 */
export function NodeResizerShell({
  selected,
  minWidth = 220,
  minHeight = 120,
}: {
  selected?: boolean;
  minWidth?: number;
  minHeight?: number;
}) {
  return (
    <NodeResizer
      isVisible={!!selected}
      minWidth={minWidth}
      minHeight={minHeight}
      lineClassName="border-emerald-500/60!"
      handleClassName="h-2! w-2! rounded-sm! border-emerald-500! bg-white dark:bg-neutral-900!"
    />
  );
}
