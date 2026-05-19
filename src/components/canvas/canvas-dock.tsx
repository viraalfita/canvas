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
import { cn } from "@/lib/utils";
import type { NodeType } from "@/lib/canvas/types";

type DockItem = {
  type: NodeType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "input" | "ai" | "compose" | "output";
};

const ITEMS: DockItem[] = [
  { type: "image_upload", label: "Image Upload", icon: UploadIcon, group: "input" },
  { type: "text_prompt", label: "Text Prompt", icon: TypeIcon, group: "input" },
  { type: "storyboard", label: "Storyboard", icon: ClapperboardIcon, group: "ai" },
  { type: "image_generate", label: "Image", icon: ImageIcon, group: "ai" },
  { type: "video_generate", label: "Video", icon: VideoIcon, group: "ai" },
  { type: "scene_composer", label: "Scene Composer", icon: FilmIcon, group: "compose" },
  { type: "export", label: "Export", icon: DownloadIcon, group: "output" },
];

/**
 * Floating bottom-center dock with icon-only node creators. Replaces the
 * left sidebar. Groups are visually separated by a thin divider so related
 * nodes stay adjacent (Input · AI · Compose · Output).
 */
export function CanvasDock({
  onAddNode,
}: {
  onAddNode: (type: NodeType) => void;
}) {
  // Walk items once and inject group dividers between groups.
  const rendered: React.ReactNode[] = [];
  let prevGroup: DockItem["group"] | null = null;
  for (const item of ITEMS) {
    if (prevGroup && prevGroup !== item.group) {
      rendered.push(
        <div
          key={`sep-${item.group}`}
          className="mx-1 h-6 w-px bg-neutral-300 dark:bg-neutral-700"
        />,
      );
    }
    const Icon = item.icon;
    rendered.push(
      <button
        key={item.type}
        type="button"
        title={item.label}
        onClick={() => onAddNode(item.type)}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg",
          "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900",
          "dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100",
          "transition-colors",
        )}
      >
        <Icon className="h-4 w-4" />
      </button>,
    );
    prevGroup = item.group;
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-0.5 rounded-2xl border px-2 py-1.5 shadow-lg",
          "border-neutral-200 bg-white",
          "dark:border-neutral-800 dark:bg-neutral-900",
        )}
      >
        {rendered}
      </div>
    </div>
  );
}
