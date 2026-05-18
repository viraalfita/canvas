"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MoreVerticalIcon,
  PencilIcon,
  Trash2Icon,
  ImageIcon,
  CopyIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkflowSummary } from "@/lib/canvas/actions";

function shortAge(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function WorkflowCard({
  workflow,
  onDelete,
  onDuplicate,
  onRename,
}: {
  workflow: WorkflowSummary;
  onDelete: () => void;
  onDuplicate: () => void;
  onRename: (name: string) => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(workflow.name);
  const [saving, setSaving] = useState(false);

  async function commitRename() {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === workflow.name) {
      setEditing(false);
      setDraftName(workflow.name);
      return;
    }
    setSaving(true);
    try {
      await onRename(trimmed);
      setEditing(false);
    } catch {
      setDraftName(workflow.name);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="group relative rounded-xl border border-neutral-800 bg-neutral-900 transition hover:border-neutral-700">
      <Link href={`/canvas/${workflow.id}`} className="block">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-xl bg-neutral-950">
          {workflow.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={workflow.thumbnail_url}
              alt={workflow.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-neutral-700">
              <ImageIcon className="h-10 w-10" />
            </div>
          )}
        </div>
      </Link>

      <div className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setEditing(false);
                  setDraftName(workflow.name);
                }
              }}
              disabled={saving}
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm outline-none focus:border-neutral-500"
            />
          ) : (
            <Link href={`/canvas/${workflow.id}`} className="block">
              <h3 className="truncate text-sm font-medium" title={workflow.name}>
                {workflow.name}
              </h3>
            </Link>
          )}
          <p className="mt-0.5 text-xs text-neutral-500">
            {workflow.node_count} nodes · {shortAge(workflow.updated_at)}
          </p>
        </div>

        {/* Action menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((s) => !s)}
            className={cn(
              "rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100",
              menuOpen && "bg-neutral-800 text-neutral-100",
            )}
            aria-label="Workflow actions"
          >
            <MoreVerticalIcon className="h-4 w-4" />
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-7 z-20 w-36 overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(true);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDuplicate();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
                >
                  <CopyIcon className="h-3.5 w-3.5" />
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDelete();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-neutral-800"
                >
                  <Trash2Icon className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
