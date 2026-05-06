# Product Requirements Document (PRD)
## Node-Based AI Canvas Generator
### Prompt → Image → Image → Video Workflow App

---

## 1. Product Overview

Produk ini adalah **web app node-based AI canvas generator** yang memungkinkan user membuat workflow kreatif berbasis node.

Mirip seperti visual workflow editor: user bisa membuat beberapa node AI, menghubungkan output antar-node, lalu menghasilkan output baru seperti image, video, animasi, variasi gambar, atau gabungan beberapa asset.

Contoh utama:

> Generate Image 1 + Generate Image 2 → sambungkan ke Video Generator Node → hasil jadi video.

Produk ini bukan sekadar editor canvas biasa, tapi **AI visual workflow builder**.

---

## 2. Core Concept

### 2.1 Node
Node adalah blok kerja yang punya:
- input
- proses
- output

Contoh node:
- Text Prompt Node
- Image Generator Node
- Image Upload Node
- Image Edit Node
- Image Merge Node
- Video Generator Node
- Audio Node
- Export Node

---

### 2.2 Edge / Connection
Edge adalah garis koneksi antar-node.

Fungsinya untuk mengalirkan data dari node sebelumnya ke node berikutnya.

Contoh:

```text
[Prompt Node]
      ↓
[Image Generate Node]
      ↓
[Video Generate Node]
      ↓
[Export Node]
```

Atau:

```text
[Image Generate 1] ─┐
                    ├──> [Video Generate Node]
[Image Generate 2] ─┘
```

---

## 3. Main Use Case

### Use Case 1: Generate 2 Images lalu Jadi Video

#### Goal
User ingin membuat video pendek dari dua gambar hasil generate AI.

#### Flow
1. User membuat node **Image Generate 1**
2. User input prompt:
   > “a futuristic city at night, cinematic lighting”
3. User klik Generate
4. Node menghasilkan image output
5. User membuat node **Image Generate 2**
6. User input prompt:
   > “same city during sunrise, cinematic lighting”
7. Node menghasilkan image output
8. User membuat node **Video Generator**
9. User menarik koneksi dari Image Generate 1 ke Video Generator
10. User menarik koneksi dari Image Generate 2 ke Video Generator
11. User mengisi prompt video:
    > “smooth transition from night to sunrise, cinematic camera movement”
12. User klik Generate Video
13. System memproses dua image menjadi video
14. Output muncul di node Video Generator
15. User connect ke Export Node untuk download MP4

---

## 4. Feature Detail

## 4.1 Workflow Canvas

### Description
Area utama tempat user membuat, mengatur, dan menghubungkan node.

### Requirements
- Infinite canvas
- Pan & zoom
- Drag node
- Select multiple nodes
- Delete node
- Duplicate node
- Auto arrange node
- Minimap optional

### User Actions
- Klik kanan canvas → add node
- Drag node dari sidebar
- Drag output handle ke input handle
- Klik edge untuk delete connection

---

## 4.2 Node System

### Node Anatomy
Setiap node memiliki:
- Title
- Input handle
- Output handle
- Parameter form
- Preview area
- Status indicator

### Status Node
- Idle
- Waiting for input
- Ready
- Generating
- Success
- Error

---

## 4.3 Connection System

### Description
User bisa menghubungkan output node ke input node lain.

### Rules
- Output image hanya bisa masuk ke input image
- Output video hanya bisa masuk ke input video
- Output text bisa masuk ke prompt field
- Satu input bisa menerima satu atau beberapa koneksi tergantung jenis node
- Koneksi invalid harus ditolak otomatis

### Example Valid Connection
```text
Image Generator Output → Video Generator Image Input
Text Prompt Output → Image Generator Prompt Input
Image Upload Output → Image Edit Input
```

### Example Invalid Connection
```text
Video Output → Image Prompt Input
Audio Output → Image Input
```

---

## 4.4 Image Generator Node

### Purpose
Generate gambar dari prompt.

### Inputs
- prompt text
- optional style preset
- optional reference image

### Outputs
- generated image
- metadata

### Parameters
- prompt
- negative prompt
- aspect ratio
- style
- seed
- quality

### Output Example
```json
{
  "type": "image",
  "url": "/outputs/image-123.png",
  "width": 1024,
  "height": 1024,
  "prompt": "cinematic futuristic city"
}
```

---

## 4.5 Image Upload Node

### Purpose
User upload gambar sendiri untuk dipakai di workflow.

### Inputs
- file upload

### Outputs
- image asset

### Use Case
Upload logo, product photo, face reference, background, atau asset brand.

---

## 4.6 Image Edit Node

### Purpose
Mengubah gambar berdasarkan prompt.

### Inputs
- image
- edit prompt

### Outputs
- edited image

### Example
Input image: product photo
Prompt:
> “put this product on a luxury marble table with soft lighting”

Output: image baru hasil edit.

---

## 4.7 Image Merge / Combine Node

### Purpose
Menggabungkan beberapa gambar menjadi satu output baru.

### Inputs
- image 1
- image 2
- optional image 3+
- prompt

### Outputs
- combined image

### Example
```text
[Character Image] ─┐
                   ├──> [Image Merge Node] → [Final Poster Image]
[Background Image] ┘
```

---

## 4.8 Video Generator Node

### Purpose
Membuat video dari satu atau beberapa input image.

### Inputs
- image input 1
- image input 2
- optional more images
- text prompt
- optional audio

### Outputs
- video file
- scene video clip

### Parameters
- video prompt
- duration
- fps
- camera movement
- transition style
- resolution
- aspect ratio

### Example Flow
```text
[Image Generate 1] ─┐
                    ├──> [Video Generate Node] → [Video Clip]
[Image Generate 2] ─┘
```

### Example Prompt
> “Create a smooth cinematic transition from the first image to the second image with slow camera zoom and dramatic lighting.”

### Output Example
```json
{
  "type": "video",
  "url": "/outputs/scene-01.mp4",
  "duration": 5,
  "fps": 24,
  "resolution": "1080x1920",
  "role": "scene_clip"
}
```

---

## 4.8.1 Multi-Scene Workflow

### Purpose
User bisa membuat beberapa scene terpisah, lalu menyambungkannya menjadi satu video panjang.

Konsepnya:
```text
[Scene 1 Video] ─┐
[Scene 2 Video] ─┼──> [Scene Composer / Timeline Node] → [Final Video]
[Scene 3 Video] ─┘
```

### Main Behavior
- Setiap Video Generator Node bisa dianggap sebagai satu scene/clip.
- Beberapa scene bisa disambungkan ke node baru bernama **Scene Composer Node**.
- Scene Composer menggabungkan clip berdasarkan urutan scene.
- User bisa atur transisi antar scene.
- Output akhirnya adalah satu video final MP4.

---

## 4.8.2 Scene Composer / Timeline Node

### Purpose
Menggabungkan beberapa video scene menjadi satu video final.

### Inputs
- scene video 1
- scene video 2
- scene video 3+
- optional background music
- optional voice over
- optional subtitle/caption track

### Outputs
- final video

### Parameters
- scene order
- transition type
- transition duration
- background music volume
- aspect ratio
- output resolution
- total duration

### Transition Types
- cut
- fade
- dissolve
- slide
- zoom
- cinematic blur

### Example Flow
```text
[Prompt Scene 1] → [Image Gen 1A + 1B] → [Video Scene 1] ─┐
[Prompt Scene 2] → [Image Gen 2A + 2B] → [Video Scene 2] ─┼──> [Scene Composer] → [Export MP4]
[Prompt Scene 3] → [Image Gen 3A + 3B] → [Video Scene 3] ─┘
```

### Use Case
User ingin membuat storytelling video 15–60 detik berisi beberapa adegan.

Contoh:
1. Scene 1: kota malam
2. Scene 2: karakter berjalan
3. Scene 3: matahari terbit
4. Scene Composer menggabungkan semuanya jadi video final.

### Scene Metadata Example
```json
{
  "type": "scene_video",
  "url": "https://r2-domain/videos/scene-01.mp4",
  "sceneIndex": 1,
  "duration": 5,
  "transitionOut": "fade"
}
```

---

## 4.8.3 Storyboard Node

### Purpose
Membantu user membuat banyak scene dari satu prompt cerita.

### Input
- story prompt
- jumlah scene
- style
- durasi total

### Output
- daftar scene prompt
- visual description per scene
- suggested camera movement

### Example Input
> “Buat video cinematic tentang seorang anak muda yang mengejar mimpinya di kota besar, durasi 30 detik, 5 scene.”

### Example Output
```json
{
  "scenes": [
    {
      "scene": 1,
      "prompt": "young man standing in a small room at night, cinematic lighting",
      "camera": "slow push in",
      "duration": 5
    },
    {
      "scene": 2,
      "prompt": "young man walking through busy city street, neon lights",
      "camera": "tracking shot",
      "duration": 6
    }
  ]
}
```

### Workflow
```text
[Storyboard Node]
      ↓
[Auto Create Scene Nodes]
      ↓
[Video Scene Nodes]
      ↓
[Scene Composer]
      ↓
[Final Video]
```

---

## 4.9 Text / Prompt Node

### Purpose
Menyimpan prompt reusable yang bisa disambungkan ke node lain.

### Outputs
- text

### Example
```text
[Prompt Node: cinematic style] → [Image Generator]
[Prompt Node: cinematic style] → [Video Generator]
```

---

## 4.10 Export Node

### Purpose
Menghasilkan file final untuk di-download.

### Inputs
- image
- video
- audio

### Outputs
- downloadable file

### Export Format
- PNG
- JPG
- MP4
- WEBM
- JSON workflow

---

## 5. Workflow Examples

## 5.1 Text to Image to Video

```text
[Prompt Node]
      ↓
[Image Generator]
      ↓
[Video Generator]
      ↓
[Export MP4]
```

### Use Case
Bikin video pendek dari satu prompt.

---

## 5.2 Two Images to Video

```text
[Image Generate 1] ─┐
                    ├──> [Video Generator]
[Image Generate 2] ─┘
```

### Use Case
Membuat transisi dari before → after, scene A → scene B, product old → product new.

---

## 5.3 Multi-Scene Video Workflow

```text
[Scene 1 Video] ─┐
[Scene 2 Video] ─┼──> [Scene Composer] → [Final Video] → [Export MP4]
[Scene 3 Video] ─┘
```

### Use Case
Membuat video storytelling multi-scene, misalnya:
- cinematic story
- product ads 3 scene
- anime/storyboard clip
- before-after-after result
- short film AI

### Behavior
1. User generate beberapa scene video secara terpisah.
2. Tiap scene punya durasi sendiri.
3. User connect semua scene ke Scene Composer.
4. User atur urutan scene.
5. User pilih transisi antar scene.
6. System render satu video final.

---

## 5.4 Storyboard to Multi-Scene Video

```text
[Story Prompt]
      ↓
[Storyboard Node]
      ↓
[Auto Scene 1] → [Video Scene 1] ─┐
[Auto Scene 2] → [Video Scene 2] ─┼──> [Scene Composer] → [Final Video]
[Auto Scene 3] → [Video Scene 3] ─┘
```

### Use Case
User masukin satu ide cerita, lalu system otomatis pecah jadi beberapa scene.

Example:
> “Bikin video 30 detik tentang orang miskin jadi sukses, cinematic, 5 scene.”

System akan generate:
- scene 1 prompt
- scene 2 prompt
- scene 3 prompt
- scene 4 prompt
- scene 5 prompt

Lalu tiap scene bisa diproses ke image/video node.

---

## 5.5 Product Image to Ad Video

```text
[Product Upload]
      ↓
[Image Edit: put product in luxury scene]
      ↓
[Video Generator: cinematic product ad]
      ↓
[Export MP4]
```

### Use Case
Affiliate marketer / seller bikin iklan produk cepat.

---

## 5.6 Character + Background to Video

```text
[Character Image] ─┐
                   ├──> [Image Merge]
[Background Image] ┘
          ↓
[Video Generator]
```

### Use Case
Membuat scene storytelling / fantasy / anime / cinematic.

---

## 5.7 Batch Variation Workflow

```text
[Prompt Node]
      ↓
[Image Generator x4]
      ↓
[Select Best Image]
      ↓
[Video Generator]
```

### Use Case
User generate banyak variasi lalu pilih yang paling bagus.

---

## 6. Detailed Use Cases

## 6.1 Content Creator

### Problem
Butuh bikin video visual cepat tanpa skill editing.

### Workflow
1. Tulis ide konten
2. Generate image 1
3. Generate image 2
4. Sambungkan dua image ke video node
5. Generate video cinematic
6. Export MP4

### Expected Result
Video pendek siap upload ke TikTok / Reels / Shorts.

---

## 6.2 Affiliate Marketer

### Problem
Butuh visual iklan produk yang menarik.

### Workflow
1. Upload foto produk
2. Connect ke Image Edit Node
3. Prompt: “make this product look premium”
4. Connect ke Video Generator Node
5. Prompt: “cinematic product ad with slow rotation”
6. Export video

---

## 6.3 Designer / Creative Director

### Problem
Butuh eksplorasi visual cepat.

### Workflow
1. Buat beberapa prompt node
2. Generate beberapa image style berbeda
3. Merge image terbaik
4. Generate final concept video

---

## 6.4 Small Business Owner

### Problem
Tidak punya tim desain/video.

### Workflow
1. Upload foto produk
2. Pilih template workflow “Product Ad”
3. Klik generate semua node
4. Download video final

---

## 7. User Interface Requirements

## 7.1 Main Layout

### Left Sidebar
- Node library
- Templates
- Asset library

### Center
- Workflow canvas
- Node graph
- Connections

### Right Panel
- Selected node settings
- Input parameters
- Output details

### Bottom Panel
- Generation logs
- Queue status
- Export progress

---

## 7.2 Node Library

Kategori node:

### Input Nodes
- Text Prompt
- Image Upload
- Audio Upload

### AI Nodes
- Image Generate
- Image Edit
- Image Merge
- Video Generate

### Utility Nodes
- Resize
- Crop
- Background Remove
- Upscale

### Output Nodes
- Export Image
- Export Video
- Save Workflow

---

## 8. Functional Requirements

### FR-001: User can create node
User dapat menambahkan node dari sidebar atau klik kanan canvas.

### FR-002: User can connect nodes
User dapat menarik garis dari output handle ke input handle.

### FR-003: System validates connection
System menolak koneksi jika tipe data tidak cocok.

### FR-004: User can run single node
User dapat generate hanya satu node.

### FR-005: User can run workflow
User dapat menjalankan semua node sesuai dependency graph.

### FR-006: System executes dependency order
Node yang input-nya belum tersedia harus menunggu node upstream selesai.

### FR-007: Output can be reused
Output dari satu node bisa dipakai oleh beberapa node lain.

### FR-008: User can save workflow
Workflow disimpan sebagai JSON.

### FR-009: User can export result
User bisa export image/video final.

---

## 9. Workflow Execution Logic

### 9.1 Dependency Graph
System harus membaca koneksi antar-node sebagai graph.

Contoh:
```text
A → C
B → C
C → D
```

Execution order:
1. A dan B jalan dulu
2. C jalan setelah A dan B selesai
3. D jalan setelah C selesai

---

### 9.2 Node Execution States
- idle
- queued
- running
- success
- failed
- skipped

---

### 9.3 Error Handling
Jika satu node gagal:
- tampilkan error di node
- downstream node tidak boleh jalan
- user bisa retry node gagal

---

## 10. Data Type System

### Supported Data Types
- text
- image
- video
- audio
- json

### Type Matching Rules
```text
text output → text input: valid
image output → image input: valid
video output → video input: valid
image output → video image input: valid
text output → video prompt input: valid
video output → image input: invalid
```

---

## 11. Data Model

## 11.1 Workflow JSON

```json
{
  "id": "workflow_123",
  "name": "Two Images to Video",
  "nodes": [
    {
      "id": "node_img_1",
      "type": "image_generate",
      "position": { "x": 100, "y": 200 },
      "params": {
        "prompt": "futuristic city at night",
        "aspectRatio": "9:16"
      },
      "output": {
        "type": "image",
        "url": "/outputs/img1.png"
      }
    },
    {
      "id": "node_img_2",
      "type": "image_generate",
      "position": { "x": 100, "y": 500 },
      "params": {
        "prompt": "same city at sunrise",
        "aspectRatio": "9:16"
      },
      "output": {
        "type": "image",
        "url": "/outputs/img2.png"
      }
    },
    {
      "id": "node_video_1",
      "type": "video_generate",
      "position": { "x": 600, "y": 350 },
      "params": {
        "prompt": "smooth cinematic transition",
        "duration": 5
      },
      "output": {
        "type": "video",
        "url": "/outputs/video.mp4"
      }
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node_img_1",
      "sourceHandle": "image_output",
      "target": "node_video_1",
      "targetHandle": "image_input_1"
    },
    {
      "id": "edge_2",
      "source": "node_img_2",
      "sourceHandle": "image_output",
      "target": "node_video_1",
      "targetHandle": "image_input_2"
    }
  ]
}
```

---

## 12. Recommended Tech Stack

### Frontend
- Next.js
- React Flow untuk node editor
- TailwindCSS
- Zustand untuk state management

### Backend
- Node.js / NestJS
- BullMQ untuk job queue
- Redis untuk queue
- PostgreSQL (via Supabase)

### Storage (UPDATED: Cloudflare R2)

Gunakan **Cloudflare R2 sebagai primary storage untuk semua file besar**.

#### Kenapa R2:
- Free tier cukup besar untuk MVP
- No egress fee (download gratis → penting untuk preview video/image)
- S3 compatible (mudah integrate)
- Cocok untuk AI output (image & video)

#### Dipakai untuk:
- Generated images
- Generated videos
- User uploaded assets

#### Storage Flow:
```text
Worker generate file
→ upload ke Cloudflare R2
→ dapat URL public
→ simpan URL ke database (Supabase)
→ frontend load dari R2
```

#### Struktur Bucket (Recommended):
```text
bucket/
  images/
    user_id/
      project_id/
        image-1.png
  videos/
    user_id/
      project_id/
        video-1.mp4
  assets/
    user_id/
      uploads/
```

---

### AI / Generation Providers
- Image generation API
- Image editing API
- Video generation API

Provider dibuat modular supaya gampang ganti model.

---

## 13. VPS Architecture (Updated with R2)

```text
Browser
  ↓
Next.js Frontend
  ↓
Backend API (NestJS)
  ↓
Redis (Queue)
  ↓
Worker
  ↓
AI Provider API
  ↓
Cloudflare R2 (Storage)
  ↓
URL disimpan ke Supabase DB
  ↓
Frontend fetch dari R2
```

---

## 14. VPS Minimum Requirement

### MVP
- 2 vCPU
- 4 GB RAM
- 80 GB SSD

### Recommended
- 4 vCPU
- 8 GB RAM
- 160 GB SSD

NOTE:
Karena pakai Cloudflare R2, VPS tidak perlu storage besar untuk file output.

---

## 15. Storage Strategy (Important Design Decision)

### Rules

1. **Semua file besar → R2**
   - image
   - video

2. **Database hanya simpan metadata**
```json
{
  "type": "video",
  "url": "https://r2-domain/video-123.mp4",
  "duration": 5
}
```

3. **Jangan simpan file di VPS**
- VPS hanya untuk processing
- bukan untuk storage permanen

4. **Use signed URL (optional)**
- untuk private file
- atau premium user

---

## 16. MVP Scope

### Must Have
- Workflow canvas
- Add node
- Connect node
- Image Generate Node
- Video Generate Node
- Export Node
- Save workflow JSON
- Upload ke Cloudflare R2
- Run workflow by dependency order

### Should Have
- Image Upload Node
- Image Edit Node
- Template workflow
- Retry failed node

### Nice to Have
- Real-time collaboration
- Marketplace template
- Version history
- Public share link

---

## 17. Acceptance Criteria

### AC-001
User bisa membuat dua Image Generate Node dan satu Video Generate Node.

### AC-002
User bisa menghubungkan image output dari dua node ke Video Generate Node.

### AC-003
Video Generate Node tidak bisa dijalankan jika belum menerima input image yang valid.

### AC-004
Saat kedua image tersedia, user bisa klik Generate Video.

### AC-005
Output video muncul di preview node.

### AC-006
User bisa export video sebagai MP4 dari R2.

### AC-007
Workflow bisa disimpan dan dibuka kembali dengan posisi node dan edge tetap sama.

---

## 18. Product Differentiation

Produk ini berbeda dari Canva karena:
- Bukan editor desain manual
- Fokus pada AI workflow
- Output antar-node bisa saling dipakai
- User bisa membangun pipeline kreatif sendiri

Lebih mirip:
- ComfyUI
- Runway workflow
- Visual programming untuk konten kreatif

---

## 19. Future Expansion

- Node audio to video
- Node text to speech
- Node lip sync
- Node character consistency
- Multi-scene video
- Template workflow marketplace
- Team collaboration

---

END OF DOCUMENT

