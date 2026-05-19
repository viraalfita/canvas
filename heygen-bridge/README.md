# Canvas HeyGen Bridge

Cloudflare Worker yang menjembatani Canvas (Vercel) dengan HeyGen Remote MCP.
Tujuannya: OAuth handshake, token storage, async job polling, dan webhook
fan-out — sehingga Canvas tidak pernah menyentuh credential HeyGen.

## Arsitektur singkat

```
Canvas (Vercel)  ──Bearer token──▶  Bridge (this Worker)  ──OAuth + MCP──▶  HeyGen
                                          │
                                          ├── KV (HEYGEN_TOKENS)
                                          └── QStash (polling tick)
```

OAuth flow pakai **Dynamic Client Registration (RFC 7591)** — tidak ada client
yang perlu didaftarkan manual di HeyGen dashboard. Bridge auto-register saat
pertama kali dipanggil.

## Setup awal (sekali per environment)

```bash
cd heygen-bridge
pnpm install

# Buat KV namespace, copy id-nya ke wrangler.toml
wrangler kv namespace create HEYGEN_TOKENS
wrangler kv namespace create HEYGEN_TOKENS --preview

# Set secret untuk auth Canvas → bridge
wrangler secret put CANVAS_INTERNAL_TOKEN

# Untuk dev lokal
cp .dev.vars.example .dev.vars
# edit .dev.vars
```

## Run lokal

```bash
pnpm dev
# Worker tersedia di http://localhost:8787
# Probe: curl http://localhost:8787/healthz
```

## Deploy

```bash
pnpm deploy
```

## Endpoints

| Method | Path | Auth | Tujuan |
|---|---|---|---|
| GET | `/healthz` | none | liveness probe |
| GET | `/oauth/start` | none | browser entry — redirect ke HeyGen authorize |
| GET | `/oauth/callback` | none | OAuth landing — disebut HeyGen IdP |
| GET | `/oauth/status` | bearer | dipakai Canvas untuk render badge `Connected ✅` |
| GET | `/oauth/probe` | bearer | spike helper — cek access token aktif |
| POST | `/oauth/disconnect` | bearer | drop shared token (admin action) |

Endpoint MCP-proxy (`/voices`, `/avatars`, `/videos`, `/videos/:id`) akan
ditambahkan di Track B3.
