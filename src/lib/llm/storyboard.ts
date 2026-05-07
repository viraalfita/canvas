/**
 * Story → multi-scene breakdown via the internal LLM gateway.
 * Reuses the same gateway/auth as enhance.ts.
 */

import type { StoryboardScene } from "@/lib/canvas/types";

const DEFAULT_LLM_URL =
  "https://patunganai-gateway.bhskin.workers.dev/v1/messages";

export const DEFAULT_STORYBOARD_MODEL = "claude-sonnet-4-6";

function llmUrl() {
  return process.env.INTERNAL_LLM_URL ?? DEFAULT_LLM_URL;
}

function apiKey() {
  const key = process.env.INTERNAL_LLM_API_KEY;
  if (!key) throw new Error("INTERNAL_LLM_API_KEY not configured");
  return key;
}

const SYSTEM_PROMPT = `You are an expert visual storyboarder for short cinematic video productions.

Given a story idea (in any language), break it into the requested number of scenes optimized for AI video generation. For each scene:
- write a single detailed ENGLISH prompt suitable for video generation models (VEO, Sora, Kling, Seedance) — include subject, action, camera movement, lighting, mood, and quality keywords
- specify a camera movement (slow push-in, tracking shot, static wide, drone shot, dolly out, etc)
- assign a duration in seconds, distributed across scenes to roughly match the requested total duration

Output STRICT JSON ONLY in the following exact shape:
{
  "scenes": [
    {
      "index": 1,
      "prompt": "English prompt here, comma-separated phrases, no quotes",
      "cameraMovement": "slow push-in",
      "duration": 5
    }
  ]
}

No markdown, no code fences, no commentary. Only the JSON object.`;

type AnthropicResponse = {
  content?: { type: string; text: string }[];
  error?: { type: string; message: string };
};

function buildUserMessage(input: {
  story: string;
  sceneCount: number;
  style?: string;
  totalDuration: number;
}) {
  return `Story: ${input.story.trim()}
Number of scenes: ${input.sceneCount}
Style: ${input.style?.trim() || "cinematic"}
Total duration: ${input.totalDuration} seconds`;
}

function tryParseJson(text: string): unknown {
  // Tolerant parse: strip code fences if model added them despite instructions.
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(stripped);
}

export async function generateStoryboard(input: {
  story: string;
  sceneCount: number;
  style?: string;
  totalDuration: number;
  model?: string;
}): Promise<StoryboardScene[]> {
  if (!input.story.trim()) throw new Error("Story is empty");
  if (input.sceneCount < 1 || input.sceneCount > 10) {
    throw new Error("Scene count must be between 1 and 10");
  }

  const res = await fetch(llmUrl(), {
    method: "POST",
    headers: {
      "x-api-key": apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model ?? DEFAULT_STORYBOARD_MODEL,
      max_tokens: 2000,
      stream: false,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(input) }],
    }),
    cache: "no-store",
  });

  const json = (await res.json()) as AnthropicResponse;
  if (!res.ok) {
    const detail =
      json.error?.message ?? json.error?.type ?? JSON.stringify(json);
    throw new Error(`Storyboard LLM failed: ${res.status} ${detail}`);
  }
  const text = json.content?.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("Storyboard LLM returned no text");

  let parsed: unknown;
  try {
    parsed = tryParseJson(text);
  } catch (e) {
    throw new Error(
      `Storyboard LLM returned invalid JSON: ${e instanceof Error ? e.message : String(e)}\n\nRaw: ${text.slice(0, 500)}`,
    );
  }

  const scenes = (parsed as { scenes?: unknown[] }).scenes;
  if (!Array.isArray(scenes)) {
    throw new Error("Storyboard JSON missing `scenes` array");
  }

  // Normalize and validate each scene.
  return scenes.map((raw, i) => {
    const s = raw as Partial<StoryboardScene>;
    if (typeof s.prompt !== "string" || !s.prompt.trim()) {
      throw new Error(`Scene ${i + 1} is missing a prompt`);
    }
    return {
      index: typeof s.index === "number" ? s.index : i + 1,
      prompt: s.prompt.trim(),
      cameraMovement: s.cameraMovement?.toString().trim(),
      duration: typeof s.duration === "number" ? s.duration : undefined,
    };
  });
}
