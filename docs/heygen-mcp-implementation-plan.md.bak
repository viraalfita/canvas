# HeyGen MCP Integration Implementation Plan (Revised)

## Context

Project `canvas` saat ini menjalankan image/video generation lewat APImart saja.

Titik integrasi yang relevan di codebase saat ini:

- `src/lib/apimart/client.ts`
- `src/lib/apimart/video-models.ts`
- `src/lib/workflow/execute.ts`
- `src/lib/canvas/types.ts`
- `src/components/canvas/node-video-generate.tsx`

Constraint bisnis untuk plan ini:

- App `canvas` adalah internal tool untuk tim.
- HeyGen dipakai sebagai satu akun shared/internal.
- Target utama adalah memakai billing dari existing HeyGen web plan + credits, bukan membeli API balance terpisah.
- Deployment utama app tetap di Vercel.
- Service integrasi HeyGen boleh dipisah.
- Integrasi harus scalable untuk future AI provider lain tanpa rewrite besar.

Referensi capability HeyGen MCP:

- Remote MCP endpoint: `https://mcp.heygen.com/mcp/v1/`
- OAuth-based authentication
- Existing HeyGen plan credits supported
- Tidak memerlukan API key tradisional untuk Remote MCP flow
- Custom avatars dan voices tersedia via MCP

Dokumen ini direvisi pada 18 Mei 2026.

---

# Goal

Menambahkan integrasi `HeyGen Remote MCP` ke Canvas dengan arsitektur yang:

- memungkinkan tim memakai akun shared HeyGen
- menambahkan `HeyGen node` baru yang terpisah dari APImart node
- mendukung pemilihan dan penyimpanan voice
- memakai billing dari existing HeyGen plan/credits
- tidak mengganggu flow APImart yang sudah ada
- aman untuk internal multi-user kecil
- tidak tightly coupled ke MCP implementation detail

---

# Non-goal

- Tidak mengganti seluruh pipeline APImart.
- Tidak menyatukan HeyGen ke node `video_generate` existing pada fase awal.
- Tidak membuat OAuth per-user HeyGen.
- Tidak membuat provider abstraction terlalu generic.
- Tidak mengandalkan browser cookie scraping atau unofficial auth workaround.
- Tidak memindahkan seluruh backend Canvas keluar dari Vercel.
- Tidak menjadikan MCP sebagai core orchestration architecture permanen.

---

# Current State

Saat ini node video hanya mengenal parameter:

- `prompt`
- `enhancedPrompt`
- `model`
- `aspectRatio`
- `resolution`
- `duration`
- `audio`

Belum ada konsep:

- `provider`
- `voice_id`
- `avatar_id`
- `saved voice`
- provider-specific async polling
- generation job lifecycle normalization

Secara storage, `nodes.params` sudah bertipe `jsonb`, jadi field baru dapat ditambahkan tanpa migration besar.

---

# Product Decision

Plan implementasi disederhanakan menjadi dua deliverable utama:

1. Status + setup `HeyGen Connected`
2. Node baru bernama `HeyGen`

Keputusan ini berarti:

- node `video_generate` existing tetap khusus APImart
- logic, UI, dan parameter HeyGen dipisah
- koneksi OAuth shared ditangani di level app/service
- HeyGen diposisikan sebagai workflow branch terpisah untuk avatar/voice video

Alasan:

- UX lebih jelas
- parameter HeyGen berbeda jauh dari APImart
- rollout lebih aman
- meminimalkan regression ke flow lama
- lebih mudah di-maintain untuk provider-specific lifecycle

---

# Architecture Principles

## 1. Provider Isolation

Setiap provider diperlakukan sebagai isolated capability.

Contoh:

- APImart → cinematic/video generation
- HeyGen → talking avatar + voice video
- future Veo → cinematic AI video
- future Runway → motion/video edit

Provider tidak dipaksa share parameter yang tidak compatible.

---

## 2. MCP Is Transport Layer, Not Core Architecture

MCP diperlakukan sebagai:

- capability adapter
- transport integration
- provider access layer

Bukan sebagai central workflow engine.

Tujuannya:

- mempermudah migration jika nanti pindah ke REST API resmi
- mengurangi vendor lock-in ke MCP behavior
- menjaga Canvas workflow engine tetap stabil

---

## 3. Async-first Design

HeyGen generation dianggap asynchronous sejak awal.

Semua flow harus mengasumsikan:

- job creation
- polling
- retry
- timeout
- failed lifecycle

---

# High-Level Architecture

## Components

### 1. Canvas app (Vercel)

Responsibilities:

- node editor UI
- workflow orchestration
- API routes/server actions
- Supabase persistence
- generation history
- internal auth/session

### 2. HeyGen Bridge (Cloudflare)

Responsibilities:

- OAuth/token management
- MCP communication
- provider normalization
- async polling
- retry logic
- internal API surface

### 3. Supabase

Responsibilities:

- workflow graph
- node state
- generation history
- job table
- audit trail
- presets

### 4. Queue Layer

Responsibilities:

- async generation lifecycle
- polling jobs
- retries
- concurrency control

Candidate options:

- Trigger.dev
- BullMQ
- Upstash Queue

Queue layer direkomendasikan sejak awal untuk menghindari polling chaos dan Vercel timeout.

---

# Request Flow

## Generation Flow

1. User membuat node `HeyGen`
2. User memilih:
   - voice
   - optional avatar
   - script

3. Canvas membuat `generation_job`
4. Queue memproses request
5. Worker memanggil HeyGen bridge
6. Bridge memanggil HeyGen MCP
7. Worker polling status async
8. Result disimpan ke Supabase
9. Node update ke `success/failed`

---

# Why Cloudflare

Cloudflare cocok karena:

- Workers cocok untuk lightweight internal API
- Secrets cocok untuk OAuth/token
- Cron/Workflow cocok untuk polling async
- deployment ringan
- memisahkan credential surface dari Vercel

Target minimal MVP:

- Workers
- Secrets
- KV/D1
- Cron atau Workflows

Durable Objects belum diperlukan.

---

# HeyGen MCP Facts To Honor

Berdasarkan dokumentasi HeyGen MCP:

- Remote MCP endpoint:
  `https://mcp.heygen.com/mcp/v1/`
- auth menggunakan OAuth
- billing memakai existing HeyGen plan credits
- custom avatars + voices tersedia
- domain/app whitelisting mungkin diperlukan

Implikasi:

- domain Canvas/bridge perlu dipersiapkan lebih awal
- whitelist validation wajib jadi bagian spike
- implementation tidak boleh mengasumsikan OAuth langsung bekerja tanpa approval

---

# Proposed Scope

# Phase 0 — Technical Spike

Tujuan:

Validasi capability runtime sebelum UI besar dibangun.

## Wajib dibuktikan

- shared account dapat connect
- whitelist domain berhasil
- list voices berhasil
- create video berhasil
- polling status berhasil
- billing benar-benar memakai existing credits
- async lifecycle stabil
- MCP capability benar-benar tersedia

## Exit Criteria

Spike dianggap sukses jika:

- video berhasil generated end-to-end
- voice selection benar-benar bekerja
- OAuth stable
- billing tidak memakai API balance terpisah

Jika gagal:
plan harus pivot sebelum implementation besar dimulai.

---

# Phase 1 — Bridge + Queue Foundation

## Scope

### Bridge

- connect/disconnect shared account
- token storage
- healthcheck
- `GET /voices`
- `POST /videos`
- `GET /videos/:id`

### Queue

- async job execution
- retry handling
- polling scheduler
- concurrency limiter

### Database

Tambah table:

```sql
generation_jobs
```

Minimal fields:

- id
- node_id
- provider
- external_job_id
- status
- created_by
- started_at
- completed_at
- error
- metadata

---

# Phase 2 — HeyGen Node MVP

## Scope

### UI

Tambah node baru:

```txt
heygen_generate
```

Field:

- script
- voice selector
- optional avatar
- refresh voices
- status
- output preview

### Workflow

- jalur execute khusus HeyGen
- provider adapter
- normalized lifecycle

### Storage

Voice preference disimpan di:

```json
nodes.params
```

Minimal:

```ts
{
  script: string
  voiceId?: string
  voiceLabel?: string
  avatarId?: string
}
```

---

# Phase 3 — Saved Voice UX

## Scope

- voice cache
- saved presets
- team default voice
- refresh voice manually
- stable voice labeling

## Cache Strategy

Disarankan:

- cache voice list 1 jam
- invalidate via manual refresh
- simpan:
  - `voiceId`
  - `voiceLabel`

Karena nama voice bisa berubah.

---

# Phase 4 — Hardening

## Scope

- audit trail
- reconnect flow
- observability
- internal rate limit
- better retry logic
- credit warning
- admin diagnostics

---

# Data Model Changes

## New NodeType

```ts
type NodeType =
  | "image_generate"
  | "image_upload"
  | "video_generate"
  | "heygen_generate"
  | "storyboard"
  | "scene_composer"
  | "export"
  | "text_prompt";
```

## Params

```ts
type HeygenGenerateParams = {
  script: string;
  voiceId?: string;
  voiceLabel?: string;
  avatarId?: string;
  heygenVideoId?: string;
};
```

Catatan:

- node APImart lama tetap tidak berubah
- provider-specific params tetap isolated

---

# Provider Layer

Disarankan:

```txt
src/lib/video-providers/
  apimart.ts
  heygen.ts
  types.ts
```

Tujuan:

- provider isolation
- mencegah execute.ts membesar
- mempermudah migration future provider

---

# Queue Strategy

## Recommended

Jangan polling dari frontend.

Gunakan:

```txt
Frontend
  ↓
Canvas API
  ↓
Create Job
  ↓
Queue
  ↓
Worker
  ↓
HeyGen Bridge
```

Karena:

- HeyGen async
- generation bisa lama
- Vercel timeout risk
- retry handling lebih aman

---

# Connect UX Decision

Karena ini shared account:

- reconnect/disconnect hanya admin
- user biasa hanya melihat:
  `HeyGen Connected ✅`

Disarankan tidak expose OAuth reconnect ke semua user.

---

# Storage Strategy

Jika URL output HeyGen temporary:

- mirror ke storage internal

Jika URL stabil:

- tetap pertimbangkan mirroring untuk konsistensi history

Keputusan final divalidasi pada spike.

---

# Security Model

## Rules

- token tidak pernah dikirim ke browser
- Canvas → bridge memakai internal auth
- bridge verify origin/caller
- hanya admin boleh reconnect
- logging admin action wajib ada

## Minimal Controls

- Cloudflare Secrets
- signed internal requests
- allowlist origin
- audit log

---

# Operational Risks

## 1. MCP Capability Mismatch

Mitigasi:

- spike wajib dilakukan dulu

## 2. Domain Whitelisting

Mitigasi:

- final domain disiapkan sejak awal

## 3. Shared Account Fragility

Mitigasi:

- reconnect flow
- health status
- explicit errors

## 4. Job Lifecycle Mismatch

Mitigasi:

Normalize state:

- queued
- running
- success
- failed

## 5. Shared Quota Contention

Mitigasi:

- internal concurrency limit
- future credit warning

---

# Recommended MVP Scope

Agar implementation tetap kecil dan aman:

## MVP hanya fokus pada:

- shared account
- connect status
- HeyGen node
- selectable voice
- single default avatar
- async generation
- generation history
- provider isolation

## Ditunda dulu:

- multi-avatar management
- per-user OAuth
- provider marketplace abstraction
- advanced template system
- unified media provider UI

---

# Rollout Plan

## Milestone 1

Spike selesai:

- auth berhasil
- voices berhasil
- video generation berhasil

## Milestone 2

Bridge + queue deployed

## Milestone 3

HeyGen node aktif

## Milestone 4

Saved voice + hardening

---

# Open Questions

1. Capability MCP mana saja yang benar-benar exposed runtime?
2. Domain whitelist berlaku untuk Canvas, bridge, atau keduanya?
3. Apakah avatar selection perlu di MVP?
4. Apakah output harus dimirror?
5. Apakah polling limit/rate limit ada?
6. Apakah MCP lifecycle cukup stabil untuk internal production use?

---

# Final Recommendation

## Recommended Approach

- tetap gunakan APImart untuk flow existing
- tambahkan HeyGen sebagai isolated provider
- gunakan MCP hanya sebagai provider transport layer
- gunakan shared account
- deploy bridge di Cloudflare
- gunakan async queue sejak awal
- buat node HeyGen terpisah
- validasi capability lewat spike sebelum UI besar dibangun

## Avoid

- mencampur HeyGen ke node APImart existing
- frontend polling langsung
- generic provider abstraction terlalu awal
- menjadikan MCP sebagai core orchestration architecture
