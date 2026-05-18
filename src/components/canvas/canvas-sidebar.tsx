"use client";

import {
  ImageIcon,
  UploadIcon,
  DownloadIcon,
  VideoIcon,
  ClapperboardIcon,
  FilmIcon,
  TypeIcon,
} from "lucide-react";
import type { NodeType } from "@/lib/canvas/types";

const ITEMS: {
  type: NodeType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "input" | "ai" | "compose" | "output";
}[] = [
  { type: "image_upload", label: "Image Upload", icon: UploadIcon, group: "input" },
  { type: "text_prompt", label: "Text Prompt", icon: TypeIcon, group: "input" },
  { type: "storyboard", label: "Storyboard", icon: ClapperboardIcon, group: "ai" },
  { type: "image_generate", label: "Image", icon: ImageIcon, group: "ai" },
  { type: "video_generate", label: "Video", icon: VideoIcon, group: "ai" },
  { type: "scene_composer", label: "Scene Composer", icon: FilmIcon, group: "compose" },
  { type: "export", label: "Export", icon: DownloadIcon, group: "output" },
];

const GROUP_LABEL: Record<"input" | "ai" | "compose" | "output", string> = {
  input: "Input",
  ai: "AI",
  compose: "Compose",
  output: "Output",
};

export function CanvasSidebar({
  onAddNode,
}: {
  onAddNode: (type: NodeType) => void;
}) {
  const groups: Array<"input" | "ai" | "compose" | "output"> = [
    "input",
    "ai",
    "compose",
    "output",
  ];
  return (
    <aside className="flex w-56 flex-col border-r border-neutral-800 bg-neutral-900">
      <div className="border-b border-neutral-800 p-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        Nodes
      </div>
      <div className="flex-1 overflow-y-auto">
        {groups.map((g) => (
          <div key={g} className="border-b border-neutral-800/60 p-2 last:border-b-0">
            <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-neutral-500">
              {GROUP_LABEL[g]}
            </div>
            <ul className="space-y-1">
              {ITEMS.filter((i) => i.group === g).map(({ type, label, icon: Icon }) => (
                <li key={type}>
                  <button
                    onClick={() => onAddNode(type)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-neutral-800"
                  >
                    <Icon className="h-4 w-4 text-neutral-400" />
                    <span>{label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}
