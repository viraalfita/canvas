# Canvas — Node-Based AI Workflow Generator

Web app internal untuk tim designer & content creator. Bikin workflow visual: prompt → image → image → video, semua via node graph (mirip ComfyUI / Runway workflow).

Stack: **Next.js 16 (App Router) + TypeScript + Tailwind 4 + React Flow (xyflow) + Supabase (Auth + DB + Realtime + Storage) + APImart.ai**.

## Status: Vertical Slice

Sudah berjalan end-to-end:

- Login email/password (Supabase Auth)
- Canvas dengan React Flow: drag, connect, delete node + edge
- 2 node types: **Image Generate** (text → image via APImart Seedream-5.0-Lite) dan **Export**
- Run workflow → submit ke APImart → polling → simpan hasil ke Supabase Storage → preview di node
- Realtime push status node via Supabase Realtime

Belum: video gen, image edit, image merge, scene composer, storyboard, multi-workflow list, template, dst (lihat `docs/prd.md`).

---

## Setup (sekali jalan)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set environment variables

Salin `.env.example` ke `.env.local`, isi semua field:

```bash
cp .env.example .env.local
```

| Var | Dapat dari |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sama, "anon public" key |
| `SUPABASE_SERVICE_ROLE_KEY` | sama, "service_role" key (jangan bocor!) |
| `APIMART_API_KEY` | https://apimart.ai/keys |

### 3. Apply database schema

Buka **Supabase Dashboard → SQL Editor**, paste isi [`supabase/schema.sql`](./supabase/schema.sql), jalankan. Ini bikin:

- Tabel `workflows`, `nodes`, `edges`
- RLS policy (owner-only access)
- Storage bucket `outputs` (public read)
- Publikasi `nodes` ke realtime

### 4. Enable email auth

**Supabase Dashboard → Authentication → Providers → Email** → pastikan enabled. Untuk dev, matikan "Confirm email" supaya signup langsung bisa login.

---

## Jalankan

```bash
pnpm dev
```

Buka <http://localhost:3000> → diarahkan ke `/login` → sign up → otomatis dibuatkan workflow kosong.

### Coba workflow pertama

1. Klik **Image Generate** di sidebar → tambah node
2. Isi prompt, misal `cinematic futuristic city at night`
3. Klik **Export** di sidebar → tambah node
4. Tarik garis dari handle hijau (output) di Image node ke handle biru (input) di Export node
5. Klik **Run** di toolbar atas
6. Status node berubah `idle → running → success` (polling tiap 2.5 detik)
7. Hasil image muncul di Image node + Export node, klik Download

---

## Arsitektur

```
Browser (React Flow + local state)
   ↕ realtime (postgres_changes on `nodes`)
Next.js @ Vercel
   ├─ Server Actions          → CRUD nodes/edges/positions
   ├─ /api/workflow/[id]/run  → seed eksekusi: submit ready nodes ke APImart
   └─ /api/workflow/[id]/tick → polling status APImart, dispatch downstream
        ↓                         ↓
   Supabase                   APImart.ai
   (Auth + DB + Storage)      (image/video gen, async + polling)
```

**Flow eksekusi 1 node image_generate:**

1. User klik Run → `/api/workflow/[id]/run` reset failed/success → dispatch ready nodes
2. Image node tanpa upstream → POST APImart `/v1/images/generations` → simpan `task_id`, status `running`
3. Frontend polling `/api/workflow/[id]/tick` setiap 2.5 detik
4. Tick query APImart `/v1/tasks/{id}` → kalau `completed`, download URL → upload ke Supabase Storage `outputs/<userId>/<workflowId>/...` → update node row dengan `output.url` permanent
5. Update row trigger Supabase Realtime → frontend update node UI live
6. Tick juga dispatch downstream node yg input-nya sudah siap (mis. Export)

Catatan: APImart link asli berlaku **72 jam**, makanya selalu kita mirror ke Supabase Storage saat completed.

---

## Struktur folder

```
src/
  app/
    layout.tsx, page.tsx (auto-redirect ke canvas), globals.css
    login/page.tsx                       # email/password form
    canvas/[id]/page.tsx                 # server: fetch graph → render editor
    api/
      auth/signout/route.ts
      workflow/[id]/run/route.ts
      workflow/[id]/tick/route.ts
  components/canvas/
    canvas-editor.tsx                    # React Flow root + realtime sub
    canvas-sidebar.tsx                   # add-node buttons
    canvas-toolbar.tsx                   # Run + sign out
    node-shell.tsx                       # shared node frame
    node-image-generate.tsx
    node-export.tsx
  lib/
    supabase/{client,server,middleware}.ts
    apimart/client.ts                    # submitImageGenerate, getTask
    storage/index.ts                     # persistRemoteUrl → Supabase Storage
    canvas/{types,actions}.ts            # shared types + server actions
    workflow/execute.ts                  # core graph execution logic
    utils.ts                             # cn()
supabase/schema.sql                      # DDL
docs/prd.md                              # full product requirements
```

---

## Deploy ke Vercel

1. Push repo ke GitHub
2. Vercel → Import Project → pilih repo
3. Tambahkan 4 env vars (production)
4. Deploy

Tidak perlu konfigurasi tambahan — semuanya serverless, tidak ada worker.

---

## Roadmap (post-slice)

Sesuai `docs/prd.md`:

- Image Edit Node, Image Merge Node, Image Upload Node, Text/Prompt Node
- Video Generate Node (APImart VEO3 / Sora2 / Kling)
- Storyboard Node + Scene Composer Node
- Template workflow
- Pindah storage ke Cloudflare R2 (signed URLs, no egress)
