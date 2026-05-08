"use client";

import { useState } from "react";
import { TagIcon } from "lucide-react";
import { commitNodeParams } from "./canvas-editor";

/**
 * Small editable label sitting above a node's body. Lets the user give
 * meaningful names like "MainCharacter" or "BackgroundV2" so downstream
 * nodes can reference them clearly.
 */
export function NodeNameField({
  nodeId,
  params,
}: {
  nodeId: string;
  params: Record<string, unknown>;
}) {
  const initial = (params.displayName as string | undefined) ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial);

  function commit() {
    const next = draft.trim();
    setEditing(false);
    if (next === initial) return;
    commitNodeParams(nodeId, { ...params, displayName: next || undefined });
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setEditing(false);
            setDraft(initial);
          }
        }}
        placeholder="name this node…"
        className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-[11px] text-neutral-100 outline-none focus:border-neutral-500"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(initial);
        setEditing(true);
      }}
      title="Click to rename — appears as Ref in downstream nodes"
      className="flex w-full items-center gap-1 rounded-md border border-dashed border-neutral-800 px-2 py-1 text-[11px] text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
    >
      <TagIcon className="h-3 w-3" />
      {initial || <span className="italic text-neutral-500">name this node…</span>}
    </button>
  );
}
