/**
 * Server-side client for the HeyGen bridge (Cloudflare Worker).
 *
 * The bridge owns the OAuth flow, MCP transport, and token storage. Canvas
 * only sees normalized HTTP endpoints with bearer auth. Never expose
 * `HEYGEN_BRIDGE_TOKEN` to the browser — always call this from a server
 * action or API route.
 */

function env() {
  const url = process.env.HEYGEN_BRIDGE_URL;
  const token = process.env.HEYGEN_BRIDGE_TOKEN;
  if (!url || !token) {
    throw new Error(
      "HEYGEN_BRIDGE_URL / HEYGEN_BRIDGE_TOKEN not configured — set them in .env.local",
    );
  }
  return { url, token };
}

async function bridgeFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const { url, token } = env();
  const resp = await fetch(`${url}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!resp.ok) {
    let detail = "";
    try {
      detail = await resp.text();
    } catch {
      /* ignore */
    }
    throw new Error(`bridge ${path} ${resp.status}: ${detail}`);
  }
  return (await resp.json()) as T;
}

export type HeygenStatus = {
  connected: boolean;
  expires_at?: number;
  has_refresh?: boolean;
};

export type HeygenVoice = {
  id: string;
  label: string;
  language?: string;
  gender?: string;
  preview_url?: string;
};

export type HeygenAvatar = {
  id: string;
  label: string;
  preview_url?: string;
  gender?: string;
};

export type HeygenSubmitResult = { external_job_id: string };

export type HeygenVideoStatus = {
  status: "queued" | "running" | "success" | "failed";
  video_url?: string;
  thumbnail_url?: string;
  duration_seconds?: number;
  error?: string;
};

export function getStatus(): Promise<HeygenStatus> {
  return bridgeFetch<HeygenStatus>("/oauth/status");
}

export type HeygenAccount = {
  email?: string;
  plan?: string;
  premium_credits_remaining: number | null;
  premium_credits_resets_at?: string;
  addon_credits_remaining: number | null;
};

export function getAccount(): Promise<HeygenAccount> {
  return bridgeFetch<HeygenAccount>("/account");
}

export async function listVoices(): Promise<HeygenVoice[]> {
  const r = await bridgeFetch<{ voices: HeygenVoice[] }>("/voices");
  return r.voices;
}

export async function listAvatars(): Promise<HeygenAvatar[]> {
  const r = await bridgeFetch<{ avatars: HeygenAvatar[] }>("/avatars");
  return r.avatars;
}

export function submitVideo(
  args:
    | {
        mode: "avatar";
        script: string;
        voice_id: string;
        avatar_id: string;
      }
    | {
        mode: "image";
        script: string;
        voice_id: string;
        image_url: string;
      },
): Promise<HeygenSubmitResult> {
  return bridgeFetch<HeygenSubmitResult>("/videos", {
    method: "POST",
    body: args,
  });
}

export function getVideoStatus(videoId: string): Promise<HeygenVideoStatus> {
  return bridgeFetch<HeygenVideoStatus>(`/videos/${encodeURIComponent(videoId)}`);
}

/** Browser-entry URL for the OAuth dance. Frontend redirects user here when
 *  they click "Connect HeyGen". The bridge handles the rest. */
export function connectUrl(): string {
  const { url } = env();
  return `${url}/oauth/start`;
}
