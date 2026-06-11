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
  // Pull a numeric HTTP/error code when present — the poll-path error payload
  // carries `code` separately from the message (so the message alone may not
  // contain "429"), and ApimartError exposes the HTTP status.
  let code: number | undefined;
  if (input instanceof ApimartError) {
    code = input.status;
  } else if (typeof input === "object" && input !== null) {
    const o = input as { code?: unknown; status?: unknown };
    if (typeof o.code === "number") code = o.code;
    else if (typeof o.status === "number") code = o.status;
  }
  const text = raw.toLowerCase();

  // Rate limit / throttling FIRST. Google-style throttle messages read
  // "Resource has been exhausted (e.g. check quota)" — the word "quota" there
  // is about request rate, not billing, so this must win over the balance
  // check below (otherwise it's misreported as "insufficient balance").
  if (
    code === 429 ||
    /rate.?limit|too many|over\s?load|busy|throttl|resource[\s_]?exhausted|exhausted|\b429\b/.test(
      text,
    )
  )
    return "The provider is busy or rate-limited right now. Please wait a moment and try again.";
  if (
    code === 401 ||
    code === 403 ||
    /api.?key|unauthor|forbidden|authentic|\b401\b|\b403\b/.test(text)
  )
    return "Provider authentication failed. Please check the API configuration.";
  // Billing only — note "quota" is intentionally excluded (it's ambiguous with
  // rate-limit messages, which are handled above).
  if (/insufficient|\bbalance\b|credit|not enough|payment|billing|top.?up/.test(text))
    return "Provider balance is insufficient to run this generation.";
  if (/moderat|policy|content|sensitive|nsfw|safety|blocked|reject|violat|prohibit/.test(text))
    return "The provider rejected this request — the prompt or image may violate its content policy.";
  if (/timeout|timed out|deadline/.test(text))
    return "The provider timed out. Please try again.";
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
  /** How image inputs are used (Veo3): "frame" or "reference". Only sent when
   *  the model declares `generationTypes` and image inputs are present. */
  generationType?: "frame" | "reference";
  /** Explicit end/last frame image. Appended as the final image in the list so
   *  it lands in the "end frame" slot; forces `generation_type: "frame"` on
   *  models that support it. */
  endFrameUrl?: string;
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

  if (meta.supportsImageUrls) {
    // Start-frame / reference images first, then the explicit end frame last so
    // it occupies the "end frame" slot (image_urls[last]).
    const ordered = [
      ...(input.imageUrls ?? []),
      ...(input.endFrameUrl ? [input.endFrameUrl] : []),
    ];
    let imgs = ordered.slice(0, meta.maxImages);
    // Some models reject specific counts (e.g. Omni-Flash-Ext accepts 0/1/3 but
    // not 2). Snap down to the largest allowed count <= what we have.
    if (meta.allowedImageCounts && !meta.allowedImageCounts.includes(imgs.length)) {
      const fallback = meta.allowedImageCounts
        .filter((n) => n <= imgs.length)
        .reduce((a, b) => Math.max(a, b), 0);
      imgs = imgs.slice(0, fallback);
    }
    if (imgs.length > 0) {
      if (meta.imageField === "first_frame_image") {
        body.first_frame_image = imgs[0];
      } else {
        body.image_urls = imgs;
      }
      // An explicit end frame implies frame-to-video; otherwise honour the
      // caller's pick. Only sent when the model declares `generationTypes`.
      const effectiveType = input.endFrameUrl ? "frame" : input.generationType;
      if (
        meta.generationTypes &&
        effectiveType &&
        meta.generationTypes.includes(effectiveType)
      ) {
        body.generation_type = effectiveType;
      }
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

export type VideoRemixInput = {
  /** task_id of the original video (must have completed successfully). */
  sourceTaskId: string;
  /** Must match the model used for the original video. */
  model: VideoModelId;
  /** Continuation prompt describing the extended portion. */
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  /** When true, return only the newly-extended portion (not the joined clip). */
  raw?: boolean;
};

/**
 * Extend a previously-generated video via `POST /videos/{task_id}/remix`
 * (Veo3). Returns a new task_id polled through the same `/tasks/{id}` endpoint.
 */
export async function submitVideoRemix(input: VideoRemixInput) {
  const meta = findVideoModel(input.model);
  const coerced = coerceVideoParamsForModel(input.model, {
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    duration: meta.defaultDuration,
  });

  const body: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
  };
  if (input.raw !== undefined) body.raw = input.raw;
  if (coerced.aspectRatio && meta.aspectRatios) {
    body.aspect_ratio = coerced.aspectRatio;
  }
  if (coerced.resolution && meta.resolutions) {
    body.resolution = meta.resolutionMap?.[coerced.resolution] ?? coerced.resolution;
  }

  const res = await request<{
    code: number;
    data: { status: string; task_id: string }[];
  }>(`/videos/${encodeURIComponent(input.sourceTaskId)}/remix`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const taskId = res.data?.[0]?.task_id;
  if (!taskId) throw new Error("APImart did not return a remix task_id");
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
