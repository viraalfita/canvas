import { Hono } from "hono";
import { cors } from "hono/cors";

import type { Env } from "./env";
import {
  discoverTools,
  getAccount,
  getVideoStatus,
  listAvatars,
  listVoices,
  submitVideo,
  submitVideoFromImage,
} from "./heygen";
import {
  consumePkce,
  ensureOauthClient,
  exchangeCode,
  generatePkce,
  generateState,
  getAccessToken,
  loadTokens,
  savePkce,
  saveTokens,
} from "./oauth";

const app = new Hono<{ Bindings: Env }>();

function callbackUrl(req: Request): string {
  const u = new URL(req.url);
  return `${u.origin}/oauth/callback`;
}

app.use("*", async (c, next) => {
  const corsMw = cors({
    origin: c.env.CANVAS_APP_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["content-type", "authorization"],
    credentials: true,
  });
  return corsMw(c, next);
});

/** Bearer-token gate for internal Canvas → bridge calls.
 *  OAuth callback (`/oauth/callback`) is exempt — it's hit by HeyGen's IdP,
 *  not by Canvas. `/oauth/start` is also public so the browser can redirect
 *  to it directly from a Canvas connect button. */
app.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === "/oauth/callback" || path === "/oauth/start" || path === "/healthz") {
    return next();
  }
  const auth = c.req.header("authorization");
  if (!auth || auth !== `Bearer ${c.env.CANVAS_INTERNAL_TOKEN}`) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return next();
});

app.get("/healthz", (c) => c.json({ ok: true }));

/** Connection status — Canvas polls this to render the "HeyGen ✅" badge. */
app.get("/oauth/status", async (c) => {
  const tokens = await loadTokens(c.env);
  if (!tokens) return c.json({ connected: false });
  return c.json({
    connected: true,
    expires_at: tokens.expires_at,
    has_refresh: Boolean(tokens.refresh_token),
  });
});

/** Kick off the OAuth dance. Browser redirects here directly from a Canvas
 *  "Connect HeyGen" button — no internal token needed since this just bounces
 *  to HeyGen's authorize page. */
app.get("/oauth/start", async (c) => {
  const redirectUri = callbackUrl(c.req.raw);
  const client = await ensureOauthClient(c.env, redirectUri);

  const { verifier, challenge } = await generatePkce();
  const state = generateState();
  await savePkce(c.env, state, {
    verifier,
    redirect_uri: redirectUri,
    created_at: Date.now(),
  });

  // HeyGen's documented authorize URL does NOT use `scope` or `resource` —
  // the access scope is implicit in the registered client. Adding them
  // triggers a generic "unknown_error" on the authorize UI.
  const u = new URL(c.env.HEYGEN_OAUTH_AUTHORIZE_ENDPOINT);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", client.client_id);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return c.redirect(u.toString(), 302);
});

app.get("/oauth/callback", async (c) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  if (err) {
    return c.text(`OAuth error: ${err} — ${url.searchParams.get("error_description") ?? ""}`, 400);
  }
  if (!code || !state) {
    return c.text("Missing code or state", 400);
  }

  const pkce = await consumePkce(c.env, state);
  if (!pkce) return c.text("Invalid or expired state", 400);

  const client = await ensureOauthClient(c.env, pkce.redirect_uri);
  const tokens = await exchangeCode(
    c.env,
    client,
    code,
    pkce.redirect_uri,
    pkce.verifier,
  );
  await saveTokens(c.env, tokens);

  // Send the user back to Canvas with a success flag.
  const back = new URL(c.env.CANVAS_APP_ORIGIN);
  back.pathname = "/settings/integrations";
  back.searchParams.set("heygen", "connected");
  return c.redirect(back.toString(), 302);
});

/** Force-disconnect: drop the shared token. Re-connect requires a fresh
 *  `/oauth/start`. */
app.post("/oauth/disconnect", async (c) => {
  await c.env.HEYGEN_TOKENS.delete("tokens:shared");
  return c.json({ ok: true });
});

/** Sanity probe: returns whether we currently hold a usable access token.
 *  Used during Phase 0 spike. */
app.get("/oauth/probe", async (c) => {
  const redirectUri = callbackUrl(c.req.raw);
  const token = await getAccessToken(c.env, redirectUri);
  if (!token) return c.json({ ok: false, reason: "no_token" }, 401);
  return c.json({ ok: true, token_preview: `${token.slice(0, 12)}…` });
});

/** Discovery: lists every tool HeyGen MCP exposes. Use this to confirm the
 *  tool names hardcoded in `heygen.ts` (list_voices, list_avatars, etc.)
 *  actually match what the server provides. */
app.get("/mcp/tools", async (c) => {
  try {
    const tools = await discoverTools(c.env, callbackUrl(c.req.raw));
    return c.json({ tools });
  } catch (e) {
    return c.json({ error: String(e) }, 502);
  }
});

/** Ad-hoc MCP tool invocation — dev/debug only. POST {name, args}. */
app.post("/mcp/call", async (c) => {
  let body: { name?: string; args?: Record<string, unknown> };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }
  if (!body.name) return c.json({ error: "name required" }, 400);
  try {
    const { callTool } = await import("./mcp");
    const r = await callTool(c.env, callbackUrl(c.req.raw), body.name, body.args ?? {});
    return c.json({ result: r });
  } catch (e) {
    return c.json({ error: String(e) }, 502);
  }
});

app.get("/account", async (c) => {
  try {
    const info = await getAccount(c.env, callbackUrl(c.req.raw));
    return c.json(info);
  } catch (e) {
    return c.json({ error: String(e) }, 502);
  }
});

app.get("/voices", async (c) => {
  try {
    const voices = await listVoices(c.env, callbackUrl(c.req.raw));
    return c.json({ voices });
  } catch (e) {
    return c.json({ error: String(e) }, 502);
  }
});

app.get("/avatars", async (c) => {
  try {
    const avatars = await listAvatars(c.env, callbackUrl(c.req.raw));
    return c.json({ avatars });
  } catch (e) {
    return c.json({ error: String(e) }, 502);
  }
});

type SubmitBody = {
  mode?: "avatar" | "image";
  script?: string;
  voice_id?: string;
  avatar_id?: string;
  image_url?: string;
  callback_url?: string;
  callback_id?: string;
};

app.post("/videos", async (c) => {
  let body: SubmitBody;
  try {
    body = (await c.req.json()) as SubmitBody;
  } catch {
    return c.json({ error: "invalid json body" }, 400);
  }
  const mode = body.mode ?? "avatar";
  if (!body.script || !body.voice_id) {
    return c.json({ error: "script and voice_id are required" }, 400);
  }
  try {
    if (mode === "image") {
      if (!body.image_url) {
        return c.json(
          { error: "image_url is required when mode=image" },
          400,
        );
      }
      const r = await submitVideoFromImage(c.env, callbackUrl(c.req.raw), {
        imageUrl: body.image_url,
        script: body.script,
        voiceId: body.voice_id,
        callbackUrl: body.callback_url,
        callbackId: body.callback_id,
      });
      return c.json(r);
    }

    if (!body.avatar_id) {
      return c.json(
        { error: "avatar_id is required when mode=avatar" },
        400,
      );
    }
    const r = await submitVideo(c.env, callbackUrl(c.req.raw), {
      script: body.script,
      voiceId: body.voice_id,
      avatarId: body.avatar_id,
      callbackUrl: body.callback_url,
      callbackId: body.callback_id,
    });
    return c.json(r);
  } catch (e) {
    return c.json({ error: String(e) }, 502);
  }
});

app.get("/videos/:id", async (c) => {
  try {
    const status = await getVideoStatus(
      c.env,
      callbackUrl(c.req.raw),
      c.req.param("id"),
    );
    return c.json(status);
  } catch (e) {
    return c.json({ error: String(e) }, 502);
  }
});

export default app;
