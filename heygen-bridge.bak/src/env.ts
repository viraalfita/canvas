export type Env = {
  HEYGEN_TOKENS: KVNamespace;

  HEYGEN_MCP_BASE: string;
  HEYGEN_OAUTH_BASE: string;
  HEYGEN_OAUTH_REGISTRATION_ENDPOINT: string;
  HEYGEN_OAUTH_AUTHORIZE_ENDPOINT: string;
  HEYGEN_OAUTH_TOKEN_ENDPOINT: string;
  CANVAS_APP_ORIGIN: string;

  // Secrets (set via `wrangler secret put`)
  CANVAS_INTERNAL_TOKEN: string;
};

// Keys used inside the HEYGEN_TOKENS KV namespace.
export const KV_KEYS = {
  /** OAuth client created via DCR. Persisted across deploys. */
  oauthClient: "oauth:client",
  /** Currently active access/refresh token pair for the shared HeyGen account. */
  tokens: "tokens:shared",
  /** PKCE verifier + state, scoped per in-flight authorize request. */
  pkce: (state: string) => `pkce:${state}`,
} as const;
