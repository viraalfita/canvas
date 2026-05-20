import { coerceParamsForModel, findModel, type ImageModelId } from "./models";
import {
  coerceVideoParamsForModel,
  findVideoModel,
  type VideoModelId,
} from "./video-models";

const APIMART_BASE = "https://api.apimart.ai/v1";

function apiKey() {
  const key = process.env.APIMART_API_KEY;
  if (!key) throw new Error("APIMART_API_KEY not configured");
  return key;
}

export type ApimartTaskStatus =
  | "submitted"
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type ApimartTaskResponse = {
  code: number;
  data: {
    id: string;
    status: ApimartTaskStatus;
    progress?: number;
    estimated_time?: number;
    actual_time?: number;
    created?: number;
    completed?: number;
    result?: {
      images?: { url: string[]; expires_at?: number }[];
      videos?: { url: string[]; expires_at?: number }[];
      thumbnail_url?: string;
    };
    error?: { code: number; message: string; type?: string };
  };
};

/** Error carrying APImart's raw failure detail. The detail is for logs/mapping
 *  only — never render it directly in the UI. Use `apimartUserMessage()` to get
 *  a safe, short message for users. */
export class ApimartError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(`APImart request failed: ${status} ${detail}`);
    this.name = "ApimartError";
  }
}

/**
 * Map any APImart failure — a thrown `ApimartError`, a generic Error, or a
 * task's `{ code, message, type }` error payload — to a short, user-safe
 * message. Never leaks raw API responses, status codes, endpoint paths, or
 * stack traces to the UI.
 */
export function apimartUserMessage(
  input: unknown,
  fallback = "The provider failed to run this generation. Please try again.",
): string {
  const raw =
    input instanceof ApimartError
      ? input.detail
      : input instanceof Error
        ? input.message
        : typeof input === "object" && input !== null && "message" in input
          ? String((input as { message: unknown }).message)
          : String(input ?? "");
  const text = raw.toLowerCase();

  if (/insufficient|balance|quota|credit|not enough|payment/.test(text))
    return "Provider balance is insufficient to run this generation.";
  if (/moderat|policy|content|sensitive|nsfw|safety|blocked|reject|violat|prohibit/.test(text))
    return "The provider rejected this request — the prompt or image may violate its content policy.";
  if (/rate.?limit|too many|overload|busy|throttl|\b429\b/.test(text))
    return "The provider is busy right now. Please wait a moment and try again.";
  if (/timeout|timed out|deadline/.test(text))
    return "The provider timed out. Please try again.";
  if (/api.?key|unauthor|forbidden|authentic|\b401\b|\b403\b/.test(text))
    return "Provider authentication failed. Please check the API configuration.";
  return fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${APIMART_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const json = (await res.json()) as { code: number; data?: unknown; message?: string };
  if (!res.ok || (json.code && json.code >= 400)) {
    // Keep the full detail on the error object for server logs; the UI layer
    // converts it to a safe message via `apimartUserMessage()`.
    throw new ApimartError(res.status, json.message ?? JSON.stringify(json));
  }
  return json as T;
}

export type ImageGenerateInput = {
  prompt: string;
  model: ImageModelId;
  size?: string;
  resolution?: string;
  imageUrls?: string[];
  outputFormat?: "jpeg" | "png";
};

export async function submitImageGenerate(input: ImageGenerateInput) {
  const meta = findModel(input.model);
  const coerced = coerceParamsForModel(input.model, {
    size: input.size,
    resolution: input.resolution,
  });

  const body: Record<string, unknown> = {
    model: coerced.model,
    prompt: input.prompt,
    size: coerced.size,
    n: 1,
    output_format: input.outputFormat ?? "png",
    watermark: false,
  };

  if (coerced.resolution) {
    body.resolution = meta.resolutionLowercase
      ? coerced.resolution.toLowerCase()
      : coerced.resolution;
  }

  if (meta.supportsImageUrls && input.imageUrls && input.imageUrls.length > 0) {
    body.image_urls = input.imageUrls;
  }

  const res = await request<{
    code: number;
    data: { status: string; task_id: string }[];
  }>("/images/generations", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const taskId = res.data?.[0]?.task_id;
  if (!taskId) throw new Error("APImart did not return a task_id");
  return { taskId };
}

export type VideoGenerateInput = {
  prompt: string;
  model: VideoModelId;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  imageUrls?: string[];
  audio?: boolean;
};

export async function submitVideoGenerate(input: VideoGenerateInput) {
  const meta = findVideoModel(input.model);
  const coerced = coerceVideoParamsForModel(input.model, {
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    duration: input.duration,
  });

  const body: Record<string, unknown> = {
    model: coerced.model,
    prompt: input.prompt,
    duration: coerced.duration,
  };

  if (coerced.aspectRatio && meta.aspectRatios) {
    const aspectFieldName = meta.aspectField ?? "aspect_ratio";
    body[aspectFieldName] = coerced.aspectRatio;
  }

  if (coerced.resolution && meta.resolutions) {
    const apiVal = meta.resolutionMap?.[coerced.resolution] ?? coerced.resolution;
    const resFieldName = meta.resolutionField ?? "resolution";
    body[resFieldName] = apiVal;
  }

  if (
    meta.supportsImageUrls &&
    input.imageUrls &&
    input.imageUrls.length > 0
  ) {
    const imgs = input.imageUrls.slice(0, meta.maxImages);
    if (meta.imageField === "first_frame_image") {
      body.first_frame_image = imgs[0];
    } else {
      body.image_urls = imgs;
    }
  }

  if (meta.supportsAudio && input.audio !== undefined) {
    const audioFieldName = meta.audioField ?? "audio";
    body[audioFieldName] = input.audio;
  }

  const res = await request<{
    code: number;
    data: { status: string; task_id: string }[];
  }>("/videos/generations", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const taskId = res.data?.[0]?.task_id;
  if (!taskId) throw new Error("APImart did not return a video task_id");
  return { taskId };
}

export type ApimartBalance = {
  success: boolean;
  remain_balance: number;
  used_balance: number;
  /** Older endpoint exposed this; `/user/balance` doesn't return it, so treat
   *  as optional. The UI falls back to showing numeric remain/used when absent. */
  unlimited_quota?: boolean;
};

export async function getBalance() {
  return request<ApimartBalance>("/user/balance");
}

export async function getTask(taskId: string) {
  return request<ApimartTaskResponse>(`/tasks/${taskId}?language=en`);
}
