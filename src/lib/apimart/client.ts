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
    throw new Error(
      `APImart ${path} failed: ${res.status} ${json.message ?? JSON.stringify(json)}`,
    );
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
  unlimited_quota: boolean;
};

export async function getBalance() {
  return request<ApimartBalance>("/balance");
}

export async function getTask(taskId: string) {
  return request<ApimartTaskResponse>(`/tasks/${taskId}?language=en`);
}
