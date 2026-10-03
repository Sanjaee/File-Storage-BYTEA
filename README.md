# Full-Stack Asynchronous File Storage System (Redis + Asynq + PostgreSQL BYTEA)

Sistem penyimpanan dan pengolahan file asynchronous berkinerja tinggi yang dirancang khusus untuk menangani **100, 1.000, hingga 10.000+ file** secara bersamaan **tanpa membuat UI freeze, crash, atau lag**.

Seluruh file binary disimpan langsung di dalam **PostgreSQL `BYTEA`**, menggunakan antrian **Redis + Asynq** untuk background processing, dan **TanStack Virtual** untuk virtualisasi rendering ribuan item di browser pada 60 FPS.

Aplikasi ini **TIDAK MENGGUNAKAN** filesystem upload storage permanen, dan **TIDAK MENGGUNAKAN** S3, Cloudflare R2, ataupun MinIO.

---

## 🏛️ 1. Arsitektur Asynchronous

```text
Next.js (App Router + TanStack Virtual)
   │
   │ Bounded Client Concurrency (5 active parallel streams)
   ▼
Go Upload API (Fast Response, ~10ms)
   │
   ├── Tulis initial payload ke PostgreSQL BYTEA (status = 'queued')
   ├── Enqueue Task ke Redis Asynq (HANYA membawa {fileId, batchId} - ZERO BINARY di Redis)
   │
   ▼
Return response ke UI secara instan (UI tidak menunggu kompresi!)
   │
   ▼
Redis (Asynq Queue Server)
   ├── critical (bobot 6) → user uploads
   ├── default  (bobot 3) → normal processing
   └── low      (bobot 1) → reprocessing / batch
   │
   ▼
Go Asynq Worker (Bounded Concurrency = 5)
   │
   ├── Fetch binary dari PostgreSQL
   ├── SHA-256 Deduplication Check (jika match completed file, reuse binary instan)
   ├── Compression & Optimization Engine:
   │   ├── Text: Zstandard (TXT, JSON, CSV, XML, HTML, CSS, JS) -> hemat s.d. 98%
   │   ├── Image: WebP / JPEG Quality Re-encode (simpan hanya jika lebih kecil)
   │   ├── Video: No Gzip, optional FFmpeg (H.265 / AV1)
   │   └── Already Compressed: MP4, ZIP, RAR, PDF (simpan original tanpa re-kompresi)
   │
   ▼
Simpan binary hasil optimasi ke PostgreSQL BYTEA (status = 'completed')
Update batch counter pada upload_batches
```

---

## 🗄️ 2. PostgreSQL Schema

```sql
CREATE TYPE file_status AS ENUM (
    'queued',
    'processing',
    'completed',
    'failed'
);

CREATE TABLE upload_batches (
    id UUID PRIMARY KEY,
    total_files INT NOT NULL,
    queued_files INT NOT NULL DEFAULT 0,
    processing_files INT NOT NULL DEFAULT 0,
    completed_files INT NOT NULL DEFAULT 0,
    failed_files INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE files (
    id UUID PRIMARY KEY,
    batch_id UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    original_size BIGINT NOT NULL,
    stored_size BIGINT,
    compression TEXT,
    checksum TEXT NOT NULL,
    status file_status NOT NULL DEFAULT 'queued',
    error_message TEXT,
    data BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX idx_files_status ON files (status);
CREATE INDEX idx_files_batch_id ON files (batch_id);
CREATE INDEX idx_files_checksum ON files (checksum);
CREATE INDEX idx_files_created_at ON files (created_at DESC);
```

---

## ⚡ 3. Aturan Kritis Kinerja

1. **Redis HANYA untuk Job Queue**:
   - Binary file **TIDAK PERNAH** dimasukkan ke Redis untuk menghindari kehabisan RAM.
   - Task payload Asynq hanya membawa identifier:
     ```json
     { "fileId": "uuid", "batchId": "uuid" }
     ```
2. **UI Tidak Menunggu Worker**:
   - Request upload `POST /api/upload` langsung mengembalikan `202 Accepted` dengan status `queued` dalam hitungan milidetik.
   - Browser tidak pernah hang/freeze menunggu kompresi selesai.
3. **Bounded Client Concurrency (`CLIENT_UPLOAD_CONCURRENCY=5`)**:
   - Jika pengguna memilih 1.000 atau 10.000 file, browser tidak menjalankan `Promise.all()` yang membanjiri socket jaringan.
   - Tepat 5 upload stream berjalan secara simultan; ketika 1 selesai, item berikutnya langsung diproses.
4. **TanStack Virtual (@tanstack/react-virtual)**:
   - File list di-virtualisasi sehingga hanya ~15-20 baris yang dirender ke DOM pada saat scroll.
   - Scrolling tetap 60 FPS bahkan dengan puluhan ribu item.
5. **Dua Jenis Progress yang Jelas**:
   - **Network Upload Progress**: Mengukur upload byte fisik dari browser ke Go API.
   - **Backend Processing Progress**: Mengukur persentase file yang telah dikompresi dan disimpan oleh worker Asynq.

---

## 🚀 4. Cara Menjalankan

### Opsi 1: Menggunakan Docker Compose (Direkomendasikan)

Pastikan Docker Desktop aktif, lalu jalankan:

```bash
docker compose up --build -d
```

Layanan yang otomatis berjalan:
- **Next.js Frontend**: [http://localhost:3000/files](http://localhost:3000/files)
- **Golang API**: [http://localhost:8080](http://localhost:8080)
- **Golang Asynq Worker**: Memproses antrian background dengan concurrency 5
- **Redis**: `localhost:6379` (Job queue Asynq)
- **PostgreSQL**: `localhost:5432` (Penyimpanan permanen `BYTEA`)

---

### Opsi 2: Menjalankan Secara Lokal (Dev Mode)

#### 1. Jalankan PostgreSQL dan Redis
```bash
docker run -d --name filestorage-pg -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=filestorage -p 5432:5432 postgres:16-alpine
docker run -d --name filestorage-redis -p 6379:6379 redis:7-alpine
```

#### 2. Jalankan Go API
```bash
cd backend
$env:PORT="8080"
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/filestorage?sslmode=disable"
$env:REDIS_URL="localhost:6379"
go run ./cmd/api
```

#### 3. Jalankan Go Asynq Worker (Terminal Terpisah)
```bash
cd backend
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/filestorage?sslmode=disable"
$env:REDIS_URL="localhost:6379"
$env:WORKER_CONCURRENCY="5"
go run ./cmd/worker
```

#### 4. Jalankan Frontend Next.js (Terminal Terpisah)
```bash
cd frontend
npm install
npm run dev
```

Buka browser di [http://localhost:3000/files](http://localhost:3000/files).

---

## 📡 5. REST API Endpoints

| Method | Endpoint | Deskripsi |
| :--- | :--- | :--- |
| `POST` | `/api/upload` | Upload cepat (simpan queued ke DB & enqueue Asynq) |
| `POST` | `/api/upload-batches` | Inisialisasi batch untuk tracking progress multi-file |
| `GET` | `/api/upload-batches/{id}` | Status agregasi batch (`total`, `queued`, `processing`, `completed`, `failed`) |
| `GET` | `/api/files` | Daftar file terpaginasi (dengan filter status, search, limit, offset) |
| `GET` | `/api/files/{id}` | Streaming / download binary langsung dari `BYTEA` |
| `GET` | `/api/files/{id}/meta` | Metadata lengkap file & resolusi media |
| `GET` | `/api/stats` | Agregasi kapasitas storage & antrian |
| `DELETE` | `/api/files/{id}` | Hapus file dan binary dari PostgreSQL |
| `GET` | `/health` & `/ready` | Health check & readiness check |

### Contoh Upload via `curl`:
```bash
curl -F "file=@photo.jpg" http://localhost:8080/api/upload
```

Response instan:
```json
{
  "fileId": "70a88ec3-6034-42ec-8c40-97a692002518",
  "filename": "photo.jpg",
  "mimeType": "image/jpeg",
  "originalSize": 10485760,
  "checksum": "aad1ce42...",
  "status": "queued"
}
```
Worker Asynq di latar belakang akan otomatis mengambil file, melakukan kompresi WebP, dan memperbarui status ke `completed` dalam database PostgreSQL `BYTEA`.
