/**
 * Curated APImart video-generation models, all on `POST /v1/videos/generations`.
 * Each model has slightly different conventions (some use `size` instead of
 * `aspect_ratio`, Kling uses `mode` for resolution, Grok uses `quality`,
 * MiniMax uses `first_frame_image`, Seedance 2.0 uses `generate_audio`, etc).
 * The metadata below tells the client how to translate display values to
 * API field names + values.
 */

export type VideoModelId =
  | "doubao-seedance-1-5-pro"
  | "doubao-seedance-2.0"
  | "doubao-seedance-2.0-fast"
  | "wan2.6"
  | "wan2.7"
  | "MiniMax-Hailuo-2.3"
  | "MiniMax-Hailuo-2.3-Fast"
  | "MiniMax-Hailuo-02"
  | "kling-v2-6"
  | "kling-v3"
  | "veo3.1-fast"
  | "veo3.1-quality"
  | "viduq3-pro"
  | "viduq3-turbo"
  | "skyreels-v4-std"
  | "skyreels-v4-fast"
  | "grok-imagine-1.0-video-apimart"
  | "sora-2-pro"
  | "sora-2-vip";

export type VideoModel = {
  id: VideoModelId;
  label: string;
  vendor: string;
  hint?: string;
  /** Valid aspect ratio values; null when the model doesn't accept that field. */
  aspectRatios: string[] | null;
  /** Valid resolution display strings (e.g. "720p"). null = field not used. */
  resolutions: string[] | null;
  /** Valid duration values in seconds. */
  durations: number[];
  defaultDuration: number;
  supportsImageUrls: boolean;
  /** Max number of reference images the model accepts. */
  maxImages: number;
  supportsAudio: boolean;

  // ---- Quirk handling: per-model field-name and value translations ----
  /** Field name for aspect ratio. Defaults to "aspect_ratio". */
  aspectField?: "aspect_ratio" | "size";
  /** Field name for resolution. Defaults to "resolution". */
  resolutionField?: "resolution" | "mode" | "quality";
  /** Map of display value → API value for resolution. */
  resolutionMap?: Record<string, string>;
  /** Field name when sending a single image. Defaults to "image_urls" (array). */
  imageField?: "image_urls" | "first_frame_image";
  /** Field name for the audio toggle. Defaults to "audio". */
  audioField?: "audio" | "generate_audio";
};

export const VIDEO_MODELS: VideoModel[] = [
  // --- Doubao Seedance family ---
  {
    id: "doubao-seedance-1-5-pro",
    label: "Seedance 1.5 Pro",
    vendor: "Doubao",
    hint: "cheap default, T2V + first/last frame, audio",
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    resolutions: ["480p", "720p", "1080p"],
    durations: [4, 5, 6, 8, 10, 12],
    defaultDuration: 5,
    supportsImageUrls: true,
    maxImages: 2,
    supportsAudio: true,
  },
  {
    id: "doubao-seedance-2.0",
    label: "Seedance 2.0",
    vendor: "Doubao",
    hint: "9 image refs, audio, video continuation",
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"],
    resolutions: ["480p", "720p", "1080p"],
    durations: [4, 5, 6, 8, 10, 12, 15],
    defaultDuration: 5,
    supportsImageUrls: true,
    maxImages: 9,
    supportsAudio: true,
    aspectField: "size",
    audioField: "generate_audio",
  },
  {
    id: "doubao-seedance-2.0-fast",
    label: "Seedance 2.0 Fast",
    vendor: "Doubao",
    hint: "faster variant of 2.0",
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"],
    resolutions: ["480p", "720p"],
    durations: [4, 5, 6, 8, 10, 12, 15],
    defaultDuration: 5,
    supportsImageUrls: true,
    maxImages: 9,
    supportsAudio: true,
    aspectField: "size",
    audioField: "generate_audio",
  },

  // --- Alibaba Wan family ---
  {
    id: "wan2.6",
    label: "Wan 2.6",
    vendor: "Alibaba",
    hint: "audio support, special-effect templates",
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    resolutions: ["720p", "1080p"],
    durations: [5, 10, 15],
    defaultDuration: 5,
    supportsImageUrls: true,
    maxImages: 1,
    supportsAudio: true,
  },
  {
    id: "wan2.7",
    label: "Wan 2.7",
    vendor: "Alibaba",
    hint: "newer, audio_url, video continuation",
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    resolutions: ["720p", "1080p"],
    durations: [3, 5, 8, 10, 15],
    defaultDuration: 5,
    supportsImageUrls: true,
    maxImages: 2,
    supportsAudio: false, // uses audio_url (URL not boolean) — skip toggle for now
    aspectField: "size",
    resolutionMap: { "720p": "720P", "1080p": "1080P" },
  },

  // --- MiniMax Hailuo family ---
  {
    id: "MiniMax-Hailuo-2.3",
    label: "MiniMax Hailuo 2.3",
    vendor: "MiniMax",
    hint: "cinematic, 15 camera-movement commands",
    aspectRatios: null,
    resolutions: ["768p", "1080p"],
    durations: [6, 10],
    defaultDuration: 6,
    supportsImageUrls: true,
    maxImages: 1,
    supportsAudio: false,
    imageField: "first_frame_image",
  },
  {
    id: "MiniMax-Hailuo-2.3-Fast",
    label: "MiniMax Hailuo 2.3 Fast",
    vendor: "MiniMax",
    hint: "faster Hailuo 2.3",
    aspectRatios: null,
    resolutions: ["768p", "1080p"],
    durations: [6, 10],
    defaultDuration: 6,
    supportsImageUrls: true,
    maxImages: 1,
    supportsAudio: false,
    imageField: "first_frame_image",
  },
  {
    id: "MiniMax-Hailuo-02",
    label: "MiniMax Hailuo 02",
    vendor: "MiniMax",
    hint: "older, has 512p option",
    aspectRatios: null,
    resolutions: ["512p", "768p", "1080p"],
    durations: [5, 10],
    defaultDuration: 5,
    supportsImageUrls: true,
    maxImages: 1,
    supportsAudio: false,
    imageField: "first_frame_image",
  },

  // --- Kuaishou Kling family ---
  {
    id: "kling-v2-6",
    label: "Kling v2.6",
    vendor: "Kuaishou",
    hint: "popular, std=720P / pro=1080P",
    aspectRatios: ["16:9", "9:16", "1:1"],
    resolutions: ["720p", "1080p"],
    durations: [5, 10],
    defaultDuration: 5,
    supportsImageUrls: true,
    maxImages: 2,
    supportsAudio: true,
    resolutionField: "mode",
    resolutionMap: { "720p": "std", "1080p": "pro" },
  },
  {
    id: "kling-v3",
    label: "Kling v3",
    vendor: "Kuaishou",
    hint: "multi-shot, audio, supports 4K",
    aspectRatios: ["16:9", "9:16", "1:1"],
    resolutions: ["720p", "1080p", "4k"],
    durations: [3, 5, 8, 10, 15],
    defaultDuration: 5,
    supportsImageUrls: true,
    maxImages: 2,
    supportsAudio: true,
    resolutionField: "mode",
    resolutionMap: { "720p": "std", "1080p": "pro", "4k": "4k" },
  },

  // --- Google VEO family ---
  {
    id: "veo3.1-fast",
    label: "VEO 3.1 Fast",
    vendor: "Google",
    hint: "fast, fixed 8s, up to 4K",
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["720p", "1080p", "4k"],
    durations: [8],
    defaultDuration: 8,
    supportsImageUrls: true,
    maxImages: 3,
    supportsAudio: false,
  },
  {
    id: "veo3.1-quality",
    label: "VEO 3.1 Quality",
    vendor: "Google",
    hint: "high quality, fixed 8s, up to 4K",
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["720p", "1080p", "4k"],
    durations: [8],
    defaultDuration: 8,
    supportsImageUrls: true,
    maxImages: 3,
    supportsAudio: false,
  },

  // --- Vidu Q3 ---
  {
    id: "viduq3-pro",
    label: "Vidu Q3 Pro",
    vendor: "Vidu",
    hint: "audio default on, 1-16s",
    aspectRatios: ["16:9", "9:16", "4:3", "3:4", "1:1"],
    resolutions: ["540p", "720p", "1080p"],
    durations: [3, 5, 8, 10, 15, 16],
    defaultDuration: 5,
    supportsImageUrls: true,
    maxImages: 2,
    supportsAudio: true,
  },
  {
    id: "viduq3-turbo",
    label: "Vidu Q3 Turbo",
    vendor: "Vidu",
    hint: "faster Vidu",
    aspectRatios: ["16:9", "9:16", "4:3", "3:4", "1:1"],
    resolutions: ["540p", "720p", "1080p"],
    durations: [3, 5, 8, 10, 15, 16],
    defaultDuration: 5,
    supportsImageUrls: true,
    maxImages: 2,
    supportsAudio: true,
  },

  // --- SkyReels V4 ---
  {
    id: "skyreels-v4-std",
    label: "SkyReels V4 Std",
    vendor: "SkyReels",
    hint: "default 1080p, 3-15s",
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    resolutions: ["480p", "720p", "1080p"],
    durations: [3, 5, 8, 10, 15],
    defaultDuration: 5,
    supportsImageUrls: true,
    maxImages: 1, // first_frame_image — std mode handles single first frame
    supportsAudio: false,
    imageField: "first_frame_image",
  },
  {
    id: "skyreels-v4-fast",
    label: "SkyReels V4 Fast",
    vendor: "SkyReels",
    hint: "faster SkyReels",
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    resolutions: ["480p", "720p", "1080p"],
    durations: [3, 5, 8, 10, 15],
    defaultDuration: 5,
    supportsImageUrls: true,
    maxImages: 1,
    supportsAudio: false,
    imageField: "first_frame_image",
  },

  // --- xAI Grok Imagine ---
  {
    id: "grok-imagine-1.0-video-apimart",
    label: "Grok Imagine 1.0",
    vendor: "xAI",
    hint: "up to 7 image refs, 6-30s, 480p/720p",
    aspectRatios: ["16:9", "9:16", "1:1", "3:2", "2:3"],
    resolutions: ["480p", "720p"],
    durations: [6, 10, 15, 20, 30],
    defaultDuration: 6,
    supportsImageUrls: true,
    maxImages: 7,
    supportsAudio: false,
    aspectField: "size",
    resolutionField: "quality",
  },

  // --- OpenAI Sora 2 ---
  {
    id: "sora-2-pro",
    label: "Sora 2 Pro",
    vendor: "OpenAI",
    hint: "premium, 10/15/25s, 24h URL (we mirror)",
    aspectRatios: ["16:9", "9:16"],
    resolutions: null,
    durations: [10, 15, 25],
    defaultDuration: 10,
    supportsImageUrls: true,
    maxImages: 3,
    supportsAudio: false,
  },
  {
    id: "sora-2-vip",
    label: "Sora 2 VIP",
    vendor: "OpenAI",
    hint: "10/15s, 24h URL (we mirror)",
    aspectRatios: ["16:9", "9:16"],
    resolutions: null,
    durations: [10, 15],
    defaultDuration: 10,
    supportsImageUrls: true,
    maxImages: 3,
    supportsAudio: false,
  },
];

export const DEFAULT_VIDEO_MODEL: VideoModelId = "veo3.1-fast";

export function findVideoModel(id: string | undefined): VideoModel {
  return (
    VIDEO_MODELS.find((m) => m.id === id) ??
    VIDEO_MODELS.find((m) => m.id === DEFAULT_VIDEO_MODEL)!
  );
}

export function coerceVideoParamsForModel(
  modelId: VideoModelId,
  params: { aspectRatio?: string; resolution?: string; duration?: number },
): {
  model: VideoModelId;
  aspectRatio?: string;
  resolution?: string;
  duration: number;
} {
  const m = findVideoModel(modelId);
  const aspectRatio = !m.aspectRatios
    ? undefined
    : params.aspectRatio && m.aspectRatios.includes(params.aspectRatio)
      ? params.aspectRatio
      : m.aspectRatios[0];
  const resolution = !m.resolutions
    ? undefined
    : params.resolution && m.resolutions.includes(params.resolution)
      ? params.resolution
      : m.resolutions[0];
  const duration =
    typeof params.duration === "number" && m.durations.includes(params.duration)
      ? params.duration
      : m.defaultDuration;
  return { model: m.id, aspectRatio, resolution, duration };
}
