import { DEFAULT_IMAGE_MODEL, type ImageModelId } from "@/lib/apimart/models";
import {
  DEFAULT_VIDEO_MODEL,
  type VideoModelId,
} from "@/lib/apimart/video-models";

export type NodeType =
  | "image_generate"
  | "image_upload"
  | "video_generate"
  | "storyboard"
  | "scene_composer"
  | "export";

export type NodeStatus =
  | "idle"
  | "queued"
  | "running"
  | "success"
  | "failed";

export type NodeOutput =
  | { kind: "image"; url: string; mimeType: string }
  | { kind: "video"; url: string; mimeType: string; thumbnailUrl?: string };

export type NodeUsage = {
  model?: string;
  actualTime?: number; // seconds reported by APImart
  estimatedTime?: number;
  completedAt?: number; // unix
  /** 0-100, populated by polling tick while task is in-progress. */
  progress?: number;
};

export type ImageGenerateParams = {
  prompt: string;
  /** LLM-expanded version of `prompt`. When non-empty, this is what gets sent
   *  to APImart instead of `prompt`. Lets the user keep their short idea
   *  separate from the detailed generated prompt. */
  enhancedPrompt?: string;
  model: ImageModelId;
  /** Aspect ratio string accepted by the chosen model (e.g. "1:1", "16:9", "auto"). */
  size: string;
  /** Resolution accepted by the chosen model (e.g. "2K"). Undefined when the model has no resolution field. */
  resolution?: string;
};

export type ImageUploadParams = {
  /** stored file name, just for display */
  filename?: string;
};

export type VideoGenerateParams = {
  prompt: string;
  /** LLM-expanded version of `prompt`. When non-empty, this is what gets sent
   *  to APImart instead of `prompt`. */
  enhancedPrompt?: string;
  model: VideoModelId;
  /** Aspect ratio if model accepts one. */
  aspectRatio?: string;
  /** Resolution display value (e.g. "720p", "1080p", "4k"). */
  resolution?: string;
  /** Duration in seconds. */
  duration: number;
  /** Whether to generate accompanying audio (only some models support this). */
  audio?: boolean;
};

export type ExportParams = {
  filename?: string;
};

export type StoryboardScene = {
  index: number;
  prompt: string;
  cameraMovement?: string;
  duration?: number;
};

/** What kind of nodes to auto-create from the storyboard breakdown.
 *  - `video`              → N Video nodes + 1 Scene Composer (current default)
 *  - `image`              → N Image nodes only (still storyboard frames)
 *  - `image-then-video`   → N Image → N Video → 1 Scene Composer
 *                          (PRD's recommended flow — iterate cheaply on stills first) */
export type StoryboardOutputMode = "video" | "image" | "image-then-video";

/** How to wire image inputs across scenes.
 *  - `parallel`   → reference (if any) goes to every Image; scenes are independent
 *  - `sequential` → reference → Image 1 → Image 2 → … (each scene continues
 *                   from previous; great for before/after, transformation, journey) */
export type StoryboardChainMode = "parallel" | "sequential";

export type StoryboardParams = {
  story: string;
  sceneCount: number;
  style?: string;
  totalDuration: number;
  /** When true, "Generate Storyboard" auto-creates the downstream nodes
   *  according to `outputMode`. When false, only the scene breakdown is
   *  produced. Defaults to true. */
  autoCreate?: boolean;
  outputMode?: StoryboardOutputMode;
  chainMode?: StoryboardChainMode;
  /** Result of last "Generate" — kept on the node so the user can iterate. */
  scenes?: StoryboardScene[];
  /** Optional reference image (e.g. character photo) applied to every
   *  auto-generated scene as image input — for consistency across scenes. */
  referenceImageUrl?: string;
  referenceImageMime?: string;
  referenceImageFilename?: string;
};

export type SceneComposerParams = {
  /**
   * Override per-scene order (array of node ids). When empty, the order
   * follows the order the edges were added.
   */
  order?: string[];
  /** Reserved for future: transition style. */
  transition?: "cut" | "fade";
};

export type CanvasNodeRow = {
  id: string;
  workflow_id: string;
  type: NodeType;
  position_x: number;
  position_y: number;
  params: Record<string, unknown>;
  output: NodeOutput | null;
  status: NodeStatus;
  apimart_task_id: string | null;
  error: string | null;
  usage: NodeUsage | null;
};

export type NodeOutputHistoryRow = {
  id: string;
  node_id: string;
  workflow_id: string;
  output: NodeOutput;
  usage: NodeUsage | null;
  created_at: string;
};

export type CanvasEdgeRow = {
  id: string;
  workflow_id: string;
  source_node_id: string;
  source_handle: string;
  target_node_id: string;
  target_handle: string;
};

export const DEFAULT_PARAMS: Record<NodeType, Record<string, unknown>> = {
  image_generate: {
    prompt: "",
    model: DEFAULT_IMAGE_MODEL,
    size: "9:16",
    resolution: "2K",
  } satisfies ImageGenerateParams,
  image_upload: {} satisfies ImageUploadParams,
  storyboard: {
    story: "",
    sceneCount: 3,
    style: "cinematic",
    totalDuration: 15,
    autoCreate: true,
    outputMode: "video",
    chainMode: "parallel",
  } satisfies StoryboardParams,
  scene_composer: {
    transition: "cut",
  } satisfies SceneComposerParams,
  video_generate: {
    prompt: "",
    model: DEFAULT_VIDEO_MODEL,
    aspectRatio: "9:16",
    resolution: "720p",
    duration: 8, // VEO 3.1 Fast (default model) has fixed 8s duration
    audio: false,
  } satisfies VideoGenerateParams,
  export: {} satisfies ExportParams,
};
