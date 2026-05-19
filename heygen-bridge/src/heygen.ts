import type { Env } from "./env";
import { callTool, listTools } from "./mcp";

/**
 * Provider-shape adapter over the raw MCP client. These functions normalize
 * HeyGen's tool responses into the shape Canvas expects, so route handlers
 * stay thin.
 *
 * Tool names below are best-guess based on common HeyGen MCP exposes; if a
 * deploy returns "tool not found" the bridge's `/mcp/tools` endpoint lists
 * what's actually available so we can adjust.
 */

const TOOL = {
  listVoices: "list_voices",
  // HeyGen distinguishes "groups" (characters) from "looks" (outfits/poses).
  // For a flat dropdown UI we list groups — one entry per character.
  listAvatars: "list_avatar_groups",
  createVideo: "create_video_from_avatar",
  createVideoFromImage: "create_video_from_image",
  getVideoStatus: "get_video",
} as const;

export type Voice = {
  id: string;
  label: string;
  language?: string;
  gender?: string;
  preview_url?: string;
};

export type Avatar = {
  id: string;
  label: string;
  preview_url?: string;
  gender?: string;
};

export type VideoSubmitResult = {
  external_job_id: string;
};

export type VideoStatus = {
  status: "queued" | "running" | "success" | "failed";
  video_url?: string;
  thumbnail_url?: string;
  duration_seconds?: number;
  error?: string;
};

export async function listVoices(env: Env, redirectUri: string): Promise<Voice[]> {
  const raw = await callTool<unknown>(env, redirectUri, TOOL.listVoices, {
    limit: 100,
  });
  return extractList(raw, ["voices", "items", "data"]).map(normalizeVoice).filter(
    (v): v is Voice => v !== null,
  );
}

export async function listAvatars(env: Env, redirectUri: string): Promise<Avatar[]> {
  const raw = await callTool<unknown>(env, redirectUri, TOOL.listAvatars, {
    limit: 50,
  });
  return extractList(raw, ["avatar_groups", "groups", "items", "data"])
    .map(normalizeAvatar)
    .filter((a): a is Avatar => a !== null);
}

export async function submitVideo(
  env: Env,
  redirectUri: string,
  args: {
    script: string;
    voiceId: string;
    avatarId: string;
    callbackUrl?: string;
    callbackId?: string;
  },
): Promise<VideoSubmitResult> {
  const raw = await callTool<Record<string, unknown>>(
    env,
    redirectUri,
    TOOL.createVideo,
    {
      avatarId: args.avatarId,
      script: args.script,
      voiceId: args.voiceId,
      ...(args.callbackUrl ? { callbackUrl: args.callbackUrl } : {}),
      ...(args.callbackId ? { callbackId: args.callbackId } : {}),
    },
  );
  return { external_job_id: extractVideoId(raw) };
}

/**
 * Animate an arbitrary image with lip-sync. Used when the source is an
 * upstream Canvas node (image_generate / image_upload) rather than a
 * pre-made HeyGen avatar.
 */
export async function submitVideoFromImage(
  env: Env,
  redirectUri: string,
  args: {
    imageUrl: string;
    script: string;
    voiceId: string;
    callbackUrl?: string;
    callbackId?: string;
  },
): Promise<VideoSubmitResult> {
  const raw = await callTool<Record<string, unknown>>(
    env,
    redirectUri,
    TOOL.createVideoFromImage,
    {
      image: { type: "url", url: args.imageUrl },
      script: args.script,
      voiceId: args.voiceId,
      ...(args.callbackUrl ? { callbackUrl: args.callbackUrl } : {}),
      ...(args.callbackId ? { callbackId: args.callbackId } : {}),
    },
  );
  return { external_job_id: extractVideoId(raw) };
}

function extractVideoId(raw: Record<string, unknown>): string {
  const id =
    (typeof raw.videoId === "string" && raw.videoId) ||
    (typeof raw.video_id === "string" && raw.video_id) ||
    (typeof raw.id === "string" && raw.id);
  if (!id) throw new Error(`createVideo returned no id: ${JSON.stringify(raw)}`);
  return id;
}

export async function getVideoStatus(
  env: Env,
  redirectUri: string,
  videoId: string,
): Promise<VideoStatus> {
  const raw = await callTool<Record<string, unknown>>(
    env,
    redirectUri,
    TOOL.getVideoStatus,
    { videoId },
  );
  return normalizeStatus(raw);
}

export type AccountInfo = {
  email?: string;
  plan?: string;
  premium_credits_remaining: number | null;
  premium_credits_resets_at?: string;
  addon_credits_remaining: number | null;
};

export async function getAccount(env: Env, redirectUri: string): Promise<AccountInfo> {
  const raw = await callTool<Record<string, unknown>>(
    env,
    redirectUri,
    "get_current_user",
    {},
  );
  const sub = (raw.subscription as Record<string, unknown> | undefined) ?? {};
  const credits = (sub.credits as Record<string, unknown> | undefined) ?? {};
  const premium = (credits.premium_credits as Record<string, unknown> | undefined) ?? {};
  const addon = (credits.add_on_credits as Record<string, unknown> | undefined) ?? {};
  return {
    email: typeof raw.email === "string" ? raw.email : undefined,
    plan: typeof sub.plan === "string" ? sub.plan : undefined,
    premium_credits_remaining:
      typeof premium.remaining === "number" ? premium.remaining : null,
    premium_credits_resets_at:
      typeof premium.resets_at === "string" ? premium.resets_at : undefined,
    addon_credits_remaining:
      typeof addon.remaining === "number" ? addon.remaining : null,
  };
}

function extractList(raw: unknown, keys: string[]): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const o = raw as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

export async function discoverTools(env: Env, redirectUri: string) {
  return listTools(env, redirectUri);
}

function normalizeVoice(v: unknown): Voice | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const id = pickString(o, ["voice_id", "id"]);
  const label = pickString(o, ["display_name", "name", "label"]);
  if (!id) return null;
  return {
    id,
    label: label ?? id,
    language: pickString(o, ["language", "locale"]),
    gender: pickString(o, ["gender"]),
    preview_url: pickString(o, ["preview_url", "sample_url"]),
  };
}

function normalizeAvatar(a: unknown): Avatar | null {
  if (!a || typeof a !== "object") return null;
  const o = a as Record<string, unknown>;
  const id = pickString(o, ["group_id", "groupId", "id"]);
  const label = pickString(o, ["name", "group_name", "display_name", "label"]);
  if (!id) return null;
  return {
    id,
    label: label ?? id,
    preview_url: pickString(o, [
      "preview_image_url",
      "preview_url",
      "thumbnail_url",
      "previewUrl",
    ]),
    gender: pickString(o, ["gender"]),
  };
}

function normalizeStatus(o: Record<string, unknown>): VideoStatus {
  const rawStatus = pickString(o, ["status", "state"])?.toLowerCase() ?? "running";
  const status: VideoStatus["status"] =
    rawStatus === "completed" || rawStatus === "success" || rawStatus === "done"
      ? "success"
      : rawStatus === "failed" || rawStatus === "error"
        ? "failed"
        : rawStatus === "queued" || rawStatus === "pending"
          ? "queued"
          : "running";

  return {
    status,
    video_url: pickString(o, ["video_url", "url", "output_url"]),
    thumbnail_url: pickString(o, ["thumbnail_url", "thumb_url"]),
    duration_seconds:
      typeof o.duration === "number"
        ? o.duration
        : typeof o.duration_seconds === "number"
          ? o.duration_seconds
          : undefined,
    error: pickString(o, ["error", "error_message", "message"]),
  };
}

function pickString(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}
