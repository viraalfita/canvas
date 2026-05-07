"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, LogOutIcon, LayoutGridIcon } from "lucide-react";
import {
  createWorkflow,
  deleteWorkflow,
  renameWorkflow,
  type WorkflowSummary,
} from "@/lib/canvas/actions";
import { WorkflowCard } from "./workflow-card";

export function WorkflowsPage({
  initialWorkflows,
}: {
  initialWorkflows: WorkflowSummary[];
}) {
  const router = useRouter();
  const [workflows, setWorkflows] = useState(initialWorkflows);
  const [creating, setCreating] = useState(false);

  async function onCreate() {
    setCreating(true);
    try {
      const id = await createWorkflow("Untitled workflow");
      router.push(`/canvas/${id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this workflow and all its nodes? Cannot be undone.")) {
      return;
    }
    try {
      await deleteWorkflow(id);
      setWorkflows((curr) => curr.filter((w) => w.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function onRename(id: string, name: string) {
    try {
      await renameWorkflow({ id, name });
      setWorkflows((curr) =>
        curr.map((w) => (w.id === id ? { ...w, name } : w)),
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <LayoutGridIcon className="h-5 w-5 text-emerald-400" />
            <h1 className="text-lg font-semibold">Canvas</h1>
          </div>
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
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Workflows</h2>
            <p className="text-sm text-neutral-400">
              {workflows.length} {workflows.length === 1 ? "workflow" : "workflows"}
            </p>
          </div>
          <button
            onClick={onCreate}
            disabled={creating}
            className="flex items-center gap-1 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
            New workflow
          </button>
        </div>

        {workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-800 bg-neutral-900/40 py-20 text-center">
            <LayoutGridIcon className="mb-3 h-10 w-10 text-neutral-700" />
            <h3 className="text-base font-medium">No workflows yet</h3>
            <p className="mt-1 text-sm text-neutral-500">
              Create your first AI workflow to get started.
            </p>
            <button
              onClick={onCreate}
              disabled={creating}
              className="mt-4 flex items-center gap-1 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
            >
              <PlusIcon className="h-4 w-4" />
              Create workflow
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workflows.map((w) => (
              <WorkflowCard
                key={w.id}
                workflow={w}
                onDelete={() => onDelete(w.id)}
                onRename={(name) => onRename(w.id, name)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
