"use client";

import { Handle, Position, useNodeId, type NodeProps } from "@xyflow/react";
import { useEffect, useState } from "react";
import { RefreshCwIcon, PlayIcon } from "lucide-react";
import { NodeShell } from "./node-shell";
import { UsageBadge } from "./usage-badge";
import { DownloadButton } from "./download-button";
import { OutputHistory } from "./output-history";
import { MediaLightbox } from "./media-lightbox";
import { NodeNameField } from "./node-name-field";
import { NodeResizerShell } from "./node-resizer-shell";
import { UpstreamRefs } from "./upstream-refs";
import type { HeygenGenerateParams, NodeOutput } from "@/lib/canvas/types";
import type { FlowNodeData } from "@/lib/canvas/store";
import { commitNodeParams } from "./canvas-editor";

type Voice = {
  id: string;
  label: string;
  language?: string;
  gender?: string;
};

type Avatar = {
  id: string;
  label: string;
  preview_url?: string;
};

type Connection = { connected: boolean; expires_at?: number };

export function HeygenGenerateNode({ data, selected }: NodeProps) {
  const id = useNodeId() ?? "";
  const d = data as FlowNodeData;
  const params = d.params as HeygenGenerateParams;
  const mode = params.mode ?? "avatar";

  const [voices, setVoices] = useState<Voice[]>([]);
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [conn, setConn] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [vidError, setVidError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<NodeOutput | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const s = await fetch("/api/heygen/status").then((r) => r.json());
        if (cancelled) return;
        setConn(s);
        if (!s.connected) return;
        // Voices needed in both modes. Avatars only for avatar mode — but we
        // fetch eagerly so toggling doesn't show a stale empty dropdown.
        const [v, a] = await Promise.all([
          fetch("/api/heygen/voices").then((r) => r.json()),
          fetch("/api/heygen/avatars").then((r) => r.json()),
        ]);
        if (cancelled) return;
        setVoices(v.voices ?? []);
        setAvatars(a.avatars ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      const [v, a] = await Promise.all([
        fetch("/api/heygen/voices?refresh=1").then((r) => r.json()),
        fetch("/api/heygen/avatars?refresh=1").then((r) => r.json()),
      ]);
      setVoices(v.voices ?? []);
      setAvatars(a.avatars ?? []);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
      <NodeResizerShell selected={selected} minWidth={280} minHeight={300} />
      <Handle
        type="target"
        position={Position.Left}
        id="image_input"
        className="h-3! w-3! bg-blue-500!"
      />
      <NodeShell
        title="HeyGen Avatar"
        status={d.status}
        error={d.error ?? vidError}
        progress={d.usage?.progress}
        headerAction={
          <button
            type="button"
            disabled
            title="HeyGen run sementara dimatikan — menunggu strategi credit (200 premium credits/bulan)."
            className="flex cursor-not-allowed items-center gap-1 rounded-md bg-neutral-400/70 px-2 py-0.5 text-[10px] font-medium text-white opacity-60"
          >
            <PlayIcon className="h-2.5 w-2.5" />
            run
          </button>
        }
      >
        <NodeNameField nodeId={id} params={params} />

        {loading && (
          <p className="text-[10px] text-neutral-500">Checking connection…</p>
        )}

        {!loading && conn && !conn.connected && (
          <a
            href="/api/heygen/connect"
            className="block rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-center text-xs text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
          >
            Connect HeyGen account
          </a>
        )}

        {!loading && conn?.connected && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400">
                ● HeyGen connected
              </span>
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing}
                title="Refresh voices & avatars"
                className="rounded p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800"
              >
                <RefreshCwIcon
                  className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`}
                />
              </button>
            </div>

            <label className="block">
              <span className="text-[10px] uppercase text-neutral-600 dark:text-neutral-400">
                Source
              </span>
              <select
                value={mode}
                onChange={(e) =>
                  commitNodeParams(id, {
                    ...params,
                    mode: e.target.value as "avatar" | "image",
                  })
                }
                className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 px-2 py-1 text-xs outline-none"
              >
                <option value="avatar">HeyGen avatar (pre-made)</option>
                <option value="image">Upstream image (animate)</option>
              </select>
            </label>

            {mode === "image" && (
              <>
                <UpstreamRefs nodeId={id} />
                <p className="text-[10px] text-neutral-500">
                  Connect 1 image (from Image Generate / Image Upload) — it
                  will be animated with lip-sync.
                </p>
              </>
            )}

            <label className="block">
              <span className="text-[10px] uppercase text-neutral-600 dark:text-neutral-400">
                Script
              </span>
              <textarea
                value={params.script ?? ""}
                onChange={(e) =>
                  commitNodeParams(id, { ...params, script: e.target.value })
                }
                placeholder="Tulis kalimat yang akan diucapkan…"
                rows={3}
                className="nodrag nopan nowheel mt-1 w-full resize-y field-sizing-content min-h-[60px] max-h-[400px] rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 p-2 text-xs outline-none focus:border-neutral-500"
              />
            </label>

            {mode === "avatar" && (
              <label className="block">
                <span className="text-[10px] uppercase text-neutral-600 dark:text-neutral-400">
                  Avatar
                </span>
                <select
                  value={params.avatarId ?? ""}
                  onChange={(e) => {
                    const av = avatars.find((x) => x.id === e.target.value);
                    commitNodeParams(id, {
                      ...params,
                      avatarId: av?.id,
                      avatarLabel: av?.label,
                    });
                  }}
                  className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 px-2 py-1 text-xs outline-none"
                >
                  <option value="">— pilih avatar —</option>
                  {avatars.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block">
              <span className="text-[10px] uppercase text-neutral-600 dark:text-neutral-400">
                Voice
              </span>
              <select
                value={params.voiceId ?? ""}
                onChange={(e) => {
                  const vc = voices.find((x) => x.id === e.target.value);
                  commitNodeParams(id, {
                    ...params,
                    voiceId: vc?.id,
                    voiceLabel: vc?.label,
                  });
                }}
                className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 px-2 py-1 text-xs outline-none"
              >
                <option value="">— pilih voice —</option>
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                    {v.language ? ` — ${v.language}` : ""}
                    {v.gender ? ` (${v.gender})` : ""}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {d.output?.kind === "video" && (
          <>
            <video
              src={d.output.url}
              controls
              onError={() =>
                setVidError("Video failed to load. Check Storage policy.")
              }
              onLoadedData={() => setVidError(null)}
              onClick={() => d.output && setZoom(d.output)}
              className="mt-1 w-full cursor-zoom-in rounded-md border border-neutral-200 dark:border-neutral-800"
            />
            <DownloadButton output={d.output} prefix="heygen-avatar" />
          </>
        )}
        <UsageBadge usage={d.usage} />
        <OutputHistory
          nodeId={id}
          nodeType="heygen_generate"
          status={d.status}
          currentOutput={d.output}
          currentParams={params}
        />
      </NodeShell>
      <Handle
        type="source"
        position={Position.Right}
        id="video_output"
        className="h-3! w-3! bg-purple-500!"
      />
      <MediaLightbox
        output={zoom}
        caption={(params.script ?? "").slice(0, 120)}
        onClose={() => setZoom(null)}
      />
    </>
  );
}
