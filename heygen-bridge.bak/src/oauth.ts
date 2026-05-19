import type { Env } from "./env";
import { KV_KEYS } from "./env";

export type OauthClient = {
  client_id: string;
  client_secret?: string;
  registration_access_token?: string;
  registration_client_uri?: string;
  redirect_uris: string[];
};

export type TokenSet = {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_at: number; // unix ms
  scope?: string;
  id_token?: string;
};

type PkceRecord = {
  verifier: string;
  redirect_uri: string;
  created_at: number;
};

const PKCE_TTL_SECONDS = 600;

/**
 * Register this bridge as an OAuth client with HeyGen via RFC 7591 Dynamic
 * Client Registration. Result is cached in KV — re-running is idempotent
 * because we check KV first.
 */
export async function ensureOauthClient(
  env: Env,
  redirectUri: string,
): Promise<OauthClient> {
  const cached = await env.HEYGEN_TOKENS.get<OauthClient>(
    KV_KEYS.oauthClient,
    "json",
  );
  if (cached && cached.redirect_uris.includes(redirectUri)) {
    return cached;
  }

  const resp = await fetch(env.HEYGEN_OAUTH_REGISTRATION_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Canvas HeyGen Bridge",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_basic",
      scope: "openid profile email",
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`DCR failed (${resp.status}): ${body}`);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  const client: OauthClient = {
    client_id: String(data.client_id),
    client_secret:
      typeof data.client_secret === "string" ? data.client_secret : undefined,
    registration_access_token:
      typeof data.registration_access_token === "string"
        ? data.registration_access_token
        : undefined,
    registration_client_uri:
      typeof data.registration_client_uri === "string"
        ? data.registration_client_uri
        : undefined,
    redirect_uris: [redirectUri],
  };

  await env.HEYGEN_TOKENS.put(KV_KEYS.oauthClient, JSON.stringify(client));
  return client;
}

/** PKCE S256 helpers — both verifier and challenge derived from CSPRNG. */
export async function generatePkce(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const verifier = base64url(bytes);
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const challenge = base64url(new Uint8Array(hash));
  return { verifier, challenge };
}

export function generateState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

function base64url(buf: Uint8Array): string {
  let s = "";
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function savePkce(
  env: Env,
  state: string,
  record: PkceRecord,
): Promise<void> {
  await env.HEYGEN_TOKENS.put(KV_KEYS.pkce(state), JSON.stringify(record), {
    expirationTtl: PKCE_TTL_SECONDS,
  });
}

export async function consumePkce(
  env: Env,
  state: string,
): Promise<PkceRecord | null> {
  const rec = await env.HEYGEN_TOKENS.get<PkceRecord>(
    KV_KEYS.pkce(state),
    "json",
  );
  if (!rec) return null;
  await env.HEYGEN_TOKENS.delete(KV_KEYS.pkce(state));
  return rec;
}

/** Exchange authorization code → token set. */
export async function exchangeCode(
  env: Env,
  client: OauthClient,
  code: string,
  redirectUri: string,
  verifier: string,
): Promise<TokenSet> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
    client_id: client.client_id,
  });

  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  if (client.client_secret) {
    headers.authorization = `Basic ${btoa(`${client.client_id}:${client.client_secret}`)}`;
  }

  const resp = await fetch(env.HEYGEN_OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers,
    body: params.toString(),
  });
  if (!resp.ok) {
    throw new Error(`Token exchange failed (${resp.status}): ${await resp.text()}`);
  }
  return normalizeToken(await resp.json());
}

/** Refresh an expiring token. Some IdPs rotate the refresh_token; we persist
 *  whatever comes back. */
export async function refreshToken(
  env: Env,
  client: OauthClient,
  refreshTok: string,
): Promise<TokenSet> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshTok,
    client_id: client.client_id,
  });
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  if (client.client_secret) {
    headers.authorization = `Basic ${btoa(`${client.client_id}:${client.client_secret}`)}`;
  }
  const resp = await fetch(env.HEYGEN_OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers,
    body: params.toString(),
  });
  if (!resp.ok) {
    throw new Error(`Token refresh failed (${resp.status}): ${await resp.text()}`);
  }
  return normalizeToken(await resp.json());
}

function normalizeToken(raw: unknown): TokenSet {
  const r = raw as Record<string, unknown>;
  const expiresIn = typeof r.expires_in === "number" ? r.expires_in : 3600;
  return {
    access_token: String(r.access_token),
    refresh_token:
      typeof r.refresh_token === "string" ? r.refresh_token : undefined,
    token_type: typeof r.token_type === "string" ? r.token_type : "Bearer",
    expires_at: Date.now() + expiresIn * 1000,
    scope: typeof r.scope === "string" ? r.scope : undefined,
    id_token: typeof r.id_token === "string" ? r.id_token : undefined,
  };
}

export async function saveTokens(env: Env, tokens: TokenSet): Promise<void> {
  await env.HEYGEN_TOKENS.put(KV_KEYS.tokens, JSON.stringify(tokens));
}

export async function loadTokens(env: Env): Promise<TokenSet | null> {
  return env.HEYGEN_TOKENS.get<TokenSet>(KV_KEYS.tokens, "json");
}

/** Returns a valid access token, refreshing in-place if it's near expiry. */
export async function getAccessToken(
  env: Env,
  redirectUri: string,
): Promise<string | null> {
  const tokens = await loadTokens(env);
  if (!tokens) return null;

  const expiresSoon = tokens.expires_at - Date.now() < 60_000;
  if (!expiresSoon) return tokens.access_token;
  if (!tokens.refresh_token) return tokens.access_token; // best-effort; let caller hit 401

  const client = await ensureOauthClient(env, redirectUri);
  const fresh = await refreshToken(env, client, tokens.refresh_token);
  await saveTokens(env, fresh);
  return fresh.access_token;
}
