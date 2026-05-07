/**
 * Prompt enhancement via the internal LLM gateway. Uses Anthropic
 * Messages API format (top-level `system` field, `content` array in response).
 *
 * Configured via env:
 *   INTERNAL_LLM_URL     — full /v1/messages endpoint
 *   INTERNAL_LLM_API_KEY — passed as `x-api-key` header
 */

const DEFAULT_LLM_URL =
  "https://patunganai-gateway.bhskin.workers.dev/v1/messages";

export const DEFAULT_LLM_MODEL = "claude-haiku-4-5";

function llmUrl() {
  return process.env.INTERNAL_LLM_URL ?? DEFAULT_LLM_URL;
}

function apiKey() {
  const key = process.env.INTERNAL_LLM_API_KEY;
  if (!key) throw new Error("INTERNAL_LLM_API_KEY not configured");
  return key;
}

type AnthropicResponse = {
  id?: string;
  type?: string;
  role?: string;
  content?: { type: string; text: string }[];
  model?: string;
  stop_reason?: string;
  usage?: { input_tokens: number; output_tokens: number };
  error?: { type: string; message: string };
};

const SYSTEM_PROMPT_IMAGE = `You are an expert prompt engineer for AI image generation models (Flux, Seedream, GPT-Image, Imagen, Gemini Image, Qwen, etc).

Convert the user's short idea (which may be in Indonesian, English, or mixed) into a single detailed English prompt optimized for image generation. Include:
- subject and key visual details
- style descriptors (e.g. UGC, cinematic, photorealistic, anime)
- lighting and mood
- composition / camera angle / shot type
- texture / material details when relevant
- quality keywords (4k, high detail, sharp focus)

Output ONLY the final prompt as one paragraph of comma-separated phrases. No quotes, no preamble, no explanation, no list, no markdown.`;

const SYSTEM_PROMPT_VIDEO = `You are an expert prompt engineer for AI video generation models (VEO, Sora, Kling, Seedance, Hailuo, etc).

Convert the user's short idea (which may be in Indonesian, English, or mixed) into a single detailed English prompt optimized for video generation. Include:
- subject and scene description
- camera movement (e.g. slow push-in, tracking shot, static)
- motion / action description
- lighting and mood
- style (e.g. cinematic, UGC, anime)
- pacing / transition cues if multi-shot
- quality keywords (high detail, smooth motion)

Output ONLY the final prompt as one paragraph of comma-separated phrases. No quotes, no preamble, no explanation, no list, no markdown.`;

/** Expand a short user idea into a detailed image / video generation prompt. */
export async function enhancePrompt(input: {
  idea: string;
  kind: "image" | "video";
  model?: string;
  maxTokens?: number;
}): Promise<string> {
  const idea = input.idea.trim();
  if (!idea) throw new Error("Idea is empty");

  const res = await fetch(llmUrl(), {
    method: "POST",
    headers: {
      "x-api-key": apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model ?? DEFAULT_LLM_MODEL,
      max_tokens: input.maxTokens ?? 600,
      stream: false,
      system:
        input.kind === "video" ? SYSTEM_PROMPT_VIDEO : SYSTEM_PROMPT_IMAGE,
      messages: [{ role: "user", content: idea }],
    }),
    cache: "no-store",
  });

  const json = (await res.json()) as AnthropicResponse;
  if (!res.ok) {
    const detail =
      json.error?.message ?? json.error?.type ?? JSON.stringify(json);
    throw new Error(`LLM gateway failed: ${res.status} ${detail}`);
  }
  const text = json.content?.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("LLM gateway returned no text content");
  return text.trim();
}
