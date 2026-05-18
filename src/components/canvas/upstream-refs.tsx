"use client";

import { LinkIcon } from "lucide-react";
import { useCanvasStore, type FlowNodeData } from "@/lib/canvas/store";

/**
 * Small badge strip showing the display names (or fallback labels) of every
 * node feeding image input into this one. Lets the user see "this scene
 * pulls from MainCharacter + BackgroundSunset" without tracing edges.
 */
export function UpstreamRefs({ nodeId }: { nodeId: string }) {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);

  const incoming = edges.filter((e) => e.target === nodeId);
  const refs = incoming
    .map((e) => nodes.find((n) => n.id === e.source))
    .filter((n): n is NonNullable<typeof n> => Boolean(n))
    .map((n) => {
      const data = n.data as FlowNodeData;
      const params = data.params as Record<string, unknown>;
      const displayName = (params.displayName as string | undefined)?.trim();
      const filename = (params.filename as string | undefined)?.trim();
      const promptStr = (params.prompt as string | undefined) ?? "";
      const textStr = (params.text as string | undefined) ?? "";
      const fallback =
        data.nodeType === "image_upload"
          ? filename || "uploaded"
          : data.nodeType === "text_prompt"
            ? textStr.slice(0, 24) || "text prompt"
            : promptStr.slice(0, 24) ||
              data.nodeType.replace(/_/g, " ");
      return {
        id: n.id,
        kind: data.nodeType,
        label: displayName || fallback,
      };
    });

  if (refs.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <LinkIcon className="h-3 w-3 text-neutral-500" />
      <span className="text-[10px] uppercase text-neutral-500">Refs:</span>
      {refs.map((r) => (
        <span
          key={r.id}
          className="rounded-md border border-neutral-700 bg-neutral-950/40 px-1.5 py-0.5 text-[10px] text-neutral-300"
          title={r.label}
        >
          {r.label.length > 22 ? r.label.slice(0, 22) + "…" : r.label}
        </span>
      ))}
    </div>
  );
}
