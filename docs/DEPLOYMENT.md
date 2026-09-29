# Deployment

MyMA punya **dua target deploy** yang terpisah. Jangan campur keduanya di satu
pipeline `wrangler deploy`.

## 1. Dashboard (frontend) — static site

- **Lokasi:** `apps/web` (Vite + React)
- **Build:** `pnpm --filter @myma/web build` → hasil di `apps/web/dist`
- **Deploy:** **static hosting** — serve folder `dist/`. JANGAN pakai
  `wrangler deploy` untuk dashboard (dia SPA statis, bukan Worker).
- **Env produksi:** `apps/web/.env.production` (sudah di-commit):
  ```
  VITE_API_BASE=/api
  VITE_USE_MOCK=false
  ```
- Pada platform (Kodr / Cloudflare Pages / Netlify): output directory →
  `apps/web/dist`, mode = static site, tanpa deploy command wrangler.

## 2. API (control plane) — Cloudflare Worker

- **Lokasi:** `apps/api` (Hono Worker)
- **Deploy:** dari folder `apps/api`:
  ```bash
  cd apps/api
  wrangler d1 create myma                 # 1) catat database_id
  wrangler r2 bucket create backups        # 2) bikin bucket
  # 3) isi database_id + bucket_name asli di apps/api/wrangler.toml
  #    (sekarang masih "PLACEHOLDER")
  ```
- **Secrets** (via `wrangler secret put`, jangan commit):
  ```
  AGENT_KEY_ID
  AGENT_KEY
  CLOUDFLARE_API_TOKEN
  CLOUDFLARE_ZONE_ID
  MYMA_DOMAIN
  ADMIN_AUTH_MODE     # "none" hanya untuk dev
  ENVIRONMENT         # "production"
  ```
- **Deploy:**
  ```bash
  cd apps/api && wrangler deploy
  # atau dari root repo:
  pnpm deploy:api
  ```

## Routing

```
myma.kodr.site        → dashboard (static, apps/web/dist)
myma.kodr.site/api/*  → API Worker (route di Cloudflare / proxy di platform)
```

Dashboard memanggil `/api/*` (same-origin), jadi platform harus meneruskan
`myma.kodr.site/api/*` ke Worker `myma-api`.

## Catatan

- FE build butuh pnpm (bukan npm) karena dependensi `workspace:*`. Untuk deploy
  statis ini bukan masalah (vite sudah bundle semua ke `dist/`). Masalah muncul
  hanya kalau `wrangler`/`npm` mencoba install ulang package FE.
- API Worker butuh D1 (`DB`) + R2 (`BACKUPS`) binding dengan id asli.