/**
 * Curated APImart image-generation models. All use the unified
 * `POST /v1/images/generations` endpoint with `model` in the body, but each
 * model accepts a different subset of `size`, `resolution`, etc.
 *
 * Capabilities below were verified against the per-model APImart docs;
 * keep this file in sync if you add/remove models.
 */

export type ImageModelId =
  | "doubao-seedream-5-0-lite"
  | "doubao-seedream-4-5"
  | "doubao-seedream-4-0"
  | "gpt-image-2"
  | "gemini-2.5-flash-image-preview"
  | "gemini-3-pro-image-preview"
  | "imagen-4.0-apimart"
  | "qwen-image-2.0"
  | "z-image-turbo";

export type ImageModel = {
  id: ImageModelId;
  label: string;
  vendor: string;
  hint?: string;
  /** Valid `size` values to send. Always include the model's default first. */
  aspectRatios: string[];
  /**
   * Valid `resolution` values stored as upper-case display strings (e.g. "2K").
   * `null` means the model rejects the field entirely — omit when sending.
   */
  resolutions: string[] | null;
  /** Some models expect lowercase `1k`/`2k`/`4k` in the actual API payload. */
  resolutionLowercase?: boolean;
  /** Whether `image_urls` (i2i / reference image) is accepted. */
  supportsImageUrls: boolean;
  /** Max value for `n`. */
  maxN: number;
};

export const IMAGE_MODELS: ImageModel[] = [
  {
    id: "doubao-seedream-5-0-lite",
    label: "Seedream 5.0 Lite",
    vendor: "Doubao",
    hint: "fast & cheap default",
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9", "auto"],
    resolutions: ["2K", "3K"],
    supportsImageUrls: true,
    maxN: 4,
  },
  {
    id: "doubao-seedream-4-5",
    label: "Seedream 4.5",
    vendor: "Doubao",
    hint: "supports edit + 10 reference images",
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9", "9:21", "auto"],
    resolutions: ["2K", "4K"],
    supportsImageUrls: true,
    maxN: 15,
  },
  {
    id: "doubao-seedream-4-0",
    label: "Seedream 4.0",
    vendor: "Doubao",
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9", "9:21", "auto"],
    resolutions: ["1K", "2K", "4K"],
    supportsImageUrls: true,
    maxN: 15,
  },
  {
    id: "gpt-image-2",
    label: "GPT-Image 2",
    vendor: "OpenAI",
    hint: "13 aspect ratios, 1K/2K/4K",
    aspectRatios: [
      "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5",
      "16:9", "9:16", "2:1", "1:2", "21:9", "9:21", "auto",
    ],
    resolutions: ["1K", "2K", "4K"],
    resolutionLowercase: true,
    supportsImageUrls: true,
    maxN: 1,
  },
  {
    id: "gemini-2.5-flash-image-preview",
    label: "Gemini 2.5 Flash Image",
    vendor: "Google",
    hint: "fast",
    aspectRatios: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
    resolutions: ["1K"],
    supportsImageUrls: true,
    maxN: 4,
  },
  {
    id: "gemini-3-pro-image-preview",
    label: "Gemini 3 Pro Image",
    vendor: "Google",
    hint: "high quality",
    aspectRatios: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
    resolutions: ["1K", "2K", "4K"],
    supportsImageUrls: true,
    maxN: 4,
  },
  {
    id: "imagen-4.0-apimart",
    label: "Imagen 4.0",
    vendor: "Google",
    hint: "text-to-image only",
    aspectRatios: ["16:9", "1:1", "4:3", "3:4", "9:16"],
    resolutions: null,
    supportsImageUrls: false,
    maxN: 1,
  },
  {
    id: "qwen-image-2.0",
    label: "Qwen Image 2.0",
    vendor: "Alibaba",
    hint: "up to 6 images",
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"],
    resolutions: ["1K", "2K"],
    supportsImageUrls: true,
    maxN: 6,
  },
  {
    id: "z-image-turbo",
    label: "Z-Image Turbo",
    vendor: "Z.ai",
    hint: "lightweight, T2I only",
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"],
    resolutions: ["1K", "2K"],
    supportsImageUrls: false,
    maxN: 1,
  },
];

export const DEFAULT_IMAGE_MODEL: ImageModelId = "gpt-image-2";

export function findModel(id: string | undefined): ImageModel {
  return (
    IMAGE_MODELS.find((m) => m.id === id) ??
    IMAGE_MODELS.find((m) => m.id === DEFAULT_IMAGE_MODEL)!
  );
}

/**
 * Coerce arbitrary aspect/resolution params to values the chosen model
 * actually supports. Used both by the UI (when model changes) and the
 * server (defensive normalization before submitting).
 */
export function coerceParamsForModel(
  modelId: ImageModelId,
  params: { size?: string; resolution?: string },
): { model: ImageModelId; size: string; resolution?: string } {
  const m = findModel(modelId);
  const size =
    params.size && m.aspectRatios.includes(params.size)
      ? params.size
      : m.aspectRatios[0];
  let resolution: string | undefined;
  if (m.resolutions === null) {
    resolution = undefined;
  } else if (params.resolution && m.resolutions.includes(params.resolution)) {
    resolution = params.resolution;
  } else {
    resolution = m.resolutions[0];
  }
  return { model: m.id, size, resolution };
}
