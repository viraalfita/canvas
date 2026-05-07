"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PlayIcon,
  LogOutIcon,
  Loader2Icon,
  ArrowLeftIcon,
  Trash2Icon,
} from "lucide-react";
import { BalanceIndicator } from "./balance-indicator";
import { useCanvasStore } from "@/lib/canvas/store";
import { deleteWorkflow, renameWorkflow } from "@/lib/canvas/actions";

export function CanvasToolbar({
  workflowId,
  workflowName,
}: {
  workflowId: string;
  workflowName: string;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const isPolling = useCanvasStore((s) => s.isPolling);
  const startPolling = useCanvasStore((s) => s.startPolling);
  const pollCompletionTick = useCanvasStore((s) => s.pollCompletionTick);

  // Inline-editable workflow name
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(workflowName);

  async function commitRename() {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === workflowName) {
      setEditing(false);
      setDraftName(workflowName);
      return;
    }
    try {
      await renameWorkflow({ id: workflowId, name: trimmed });
      setEditing(false);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setDraftName(workflowName);
    }
  }

  async function onDelete() {
    if (!confirm("Delete this workflow and all its nodes? Cannot be undone.")) {
      return;
    }
    try {
      await deleteWorkflow(workflowId);
      router.push("/");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function onRun() {
    setRunning(true);
    try {
      const res = await fetch(`/api/workflow/${workflowId}/run`, {
        method: "POST",
      });
      if (!res.ok) {
        const text = await res.text();
        alert(`Run failed: ${text}`);
        return;
      }
      startPolling();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4 py-2">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Link
          href="/"
          title="Back to workflows"
          className="rounded p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </Link>
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
                setDraftName(workflowName);
              }
            }}
            className="min-w-0 flex-1 max-w-xs rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm outline-none focus:border-neutral-500"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Click to rename"
            className="truncate rounded px-1 py-0.5 text-sm font-medium hover:bg-neutral-800"
          >
            {workflowName}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <BalanceIndicator refreshKey={pollCompletionTick} />
        {isPolling && (
          <span className="flex items-center gap-1 text-xs text-neutral-400">
            <Loader2Icon className="h-3 w-3 animate-spin" />
            polling…
          </span>
        )}
        <button
          onClick={onRun}
          disabled={running}
          className="flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
        >
          <PlayIcon className="h-4 w-4" />
          Run all
        </button>
        <button
          onClick={onDelete}
          title="Delete this workflow"
          className="flex items-center gap-1 rounded-md border border-neutral-700 px-2 py-1.5 text-sm text-red-400 hover:bg-neutral-800"
        >
          <Trash2Icon className="h-4 w-4" />
        </button>
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="flex items-center gap-1 rounded-md border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
          >
            <LogOutIcon className="h-4 w-4" />
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
