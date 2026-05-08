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

const SYSTEM_PROMPT_IMAGE = `You convert a brief user description into ONE detailed English prompt for AI image generation models (Flux, Seedream, GPT-Image, Imagen, Gemini Image, Qwen, etc).

# CRITICAL RULES — read carefully

1. The user is sending TEXT ONLY. There is NO image attachment, NO reference photo, NO file. The user's text is your only input.
2. NEVER say "I don't see an image", "no image was provided", "please attach a photo", "I cannot find the image you mentioned", or anything similar. The user's words ARE the description — invent the visual from imagination.
3. NEVER ask clarifying questions. NEVER refuse. NEVER apologize. NEVER explain.
4. If the user's text mentions an existing image (e.g. "edit this photo of my cat"), still treat it as a description: imagine the scene yourself and write a prompt for that.
5. NEVER add a preamble like "Here is the prompt:". NEVER wrap in quotes, code fences, or markdown.

# OUTPUT FORMAT

Return EXACTLY ONE paragraph of comma-separated phrases in detailed English. No line breaks, no list, no labels.

Cover these dimensions when relevant:
- subject and key visual details
- style (photorealistic, UGC, cinematic, anime, oil painting, etc)
- lighting and mood
- composition / camera angle / shot type
- texture / material details
- quality keywords (4k, high detail, sharp focus)

# EXAMPLES

Input: wanita minum air ugc realistis
Output: Ultra realistic UGC-style photo of a young woman drinking water from a clear glass in a bright natural-lit modern kitchen, candid lifestyle moment, warm soft sunlight from window, authentic skin texture, gentle smile, hydration aesthetic, iPhone camera feel, shallow depth of field, photorealistic, high detail, 4k, social media ad style

Input: kucing main bola
Output: Adorable orange tabby kitten playfully chasing a small red yarn ball on a wooden floor in a cozy sunlit living room, soft natural light from window, dynamic motion blur on paws, sharp focus on bright green eyes, candid moment, warm earthy color palette, professional pet photography, shallow depth of field, photorealistic, high detail, 4k

Input: edit foto produk skincare jadi premium
Output: Premium skincare product photography of an elegant glass serum bottle on a polished marble surface, soft diffused studio lighting with subtle reflections, minimalist clean composition, pastel beige background, high-end editorial aesthetic, glossy bottle texture with sharp focus, ultra detailed, 4k, luxury beauty brand style

Now process the user's input.`;

const SYSTEM_PROMPT_VIDEO = `You convert a brief user description into ONE detailed English prompt for AI video generation models (VEO, Sora, Kling, Seedance, Hailuo, Runway, etc).

# CRITICAL RULES — read carefully

1. The user is sending TEXT ONLY. There is NO video, image, or file attached. The user's text is your only input.
2. NEVER say "I don't see an image/video", "no input was provided", "please share a clip", or anything similar. The user's words ARE the description — invent the scene from imagination.
3. NEVER ask clarifying questions. NEVER refuse. NEVER apologize. NEVER explain.
4. If the user's text references existing media (e.g. "animate this photo"), still treat it as a description: imagine the scene yourself and write the video prompt.
5. NEVER add a preamble like "Here is the prompt:". NEVER wrap in quotes, code fences, or markdown.

# OUTPUT FORMAT

Return EXACTLY ONE paragraph of comma-separated phrases in detailed English. No line breaks, no list, no labels.

Cover these dimensions when relevant:
- subject and scene description
- motion / action — describe what happens over time (the video moves)
- camera movement (slow push-in, tracking shot, static wide, dolly out, drone shot, handheld, etc)
- lighting and mood
- style (cinematic, UGC, anime, etc)
- pacing / transition cues
- quality keywords (high detail, smooth motion, 4k)

# EXAMPLES

Input: transisi pagi ke malam cinematic
Output: Cinematic time-lapse transition from golden morning sunrise to deep blue night over a modern city skyline, smooth slow camera push-in revealing the gradual transformation of light, warm to cool tonal shift, dramatic atmospheric clouds drifting, soft glow from waking buildings turning into glittering night lights, high detail, 4k, professional cinematography, smooth seamless motion, dramatic mood

Input: wanita pakai skincare ugc
Output: UGC vertical 9:16 video of a young woman in a soft-lit bathroom mirror gently applying skincare serum to her cheek with fingertips, slow handheld iPhone shot tracking her hand from bottle to face, natural morning light, candid lifestyle vibe, authentic skin texture, gentle smile, smooth realistic motion, high detail, 4k, social media beauty ad style

Now process the user's input.`;

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
      // Lower temperature → less drift, more reliable adherence to the
      // strict "one paragraph, no preamble" output format.
      temperature: 0.5,
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
