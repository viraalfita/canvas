"use client";

import { Handle, Position, useNodeId, type NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import { NodeNameField } from "./node-name-field";
import { NodeResizerShell } from "./node-resizer-shell";
import type { TextPromptParams } from "@/lib/canvas/types";
import type { FlowNodeData } from "@/lib/canvas/store";
import { commitNodeParams } from "./canvas-editor";
import { DebouncedTextarea } from "./debounced-textarea";

/**
 * Text Prompt node: a reusable bag of prompt text that downstream Image /
 * Video nodes can subscribe to via the `text_input` handle. At run time, the
 * runner prepends this node's text to the target's prompt — letting the user
 * author one "general style" prompt and share it across many scenes.
 */
export function TextPromptNode({ data, selected }: NodeProps) {
  const id = useNodeId() ?? "";
  const d = data as FlowNodeData;
  const params = d.params as TextPromptParams;

  return (
    <>
      <NodeResizerShell selected={selected} minWidth={240} minHeight={160} />
      <NodeShell title="Text Prompt" status={d.status} error={d.error}>
        <NodeNameField nodeId={id} params={params} />
        <label className="block">
          <span className="text-[10px] uppercase text-neutral-600 dark:text-neutral-400">
            Shared prompt (prepended to connected scenes)
          </span>
          <DebouncedTextarea
            value={params.text ?? ""}
            onCommit={(text) => commitNodeParams(id, { ...params, text })}
            placeholder="e.g. cinematic, 4k, soft natural lighting, shot on 35mm…"
            rows={5}
            className="nodrag nopan nowheel mt-1 w-full resize-y field-sizing-content min-h-[80px] max-h-[400px] rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 p-2 text-xs outline-none focus:border-neutral-500"
          />
        </label>
        <p className="text-[10px] text-neutral-500">
          Connect this node&rsquo;s right handle to an Image / Video node to
          reuse the same prompt across scenes.
        </p>
      </NodeShell>
      <Handle
        type="source"
        position={Position.Right}
        id="text_output"
        className="h-3! w-3! bg-amber-400!"
      />
    </>
  );
}
