# Deployment — Cloudflare (GitHub integration)

MyMA punya **dua target deploy Cloudflare yang terpisah**. Jangan digabung dalam
satu proyek — itu penyebab error `wrangler` + `workspace:*` yang kamu lihat.

## 1. Dashboard (frontend) → Cloudflare Pages (static)

Vite SPA **statis**, bukan Worker. Di Cloudflare dashboard:

1. **Workers & Pages → Create → Pages → Connect to Git** → pilih repo `myma`.
2. Framework preset: **Vite**
3. **Root directory**: `apps/web`
4. **Build command**: `pnpm build`
5. **Output directory**: `dist`
6. Custom domain: `myma.kodr.site`

> Jangan set "deploy command" = `wrangler deploy`. Pages langsung serve `dist/`.
> Error `workspace:*` muncul justru karena wrangler dijalankan di `apps/web` dan
> mencoba `npm install`.

## 2. API (control plane) → Cloudflare Workers

1. **Workers & Pages → Create → Workers → Connect to Git** → pilih repo `myma`.
2. **Root directory**: `apps/api`
3. Cloudflare otomatis jalankan `wrangler deploy` di `apps/api`.

**Sebelum deploy, siapkan resource D1/R2 (sekali saja):**

```bash
cd apps/api
wrangler d1 create myma           # catat database_id
wrangler r2 bucket create backups # catat nama bucket
```

Lalu edit `apps/api/wrangler.toml` — ganti `PLACEHOLDER`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "myma"
database_id = "<id-dari-wrangler-d1-create>"

[[r2_buckets]]
binding = "BACKUPS"
bucket_name = "backups"
```

**Apply migrasi ke D1** (sekali, atau tiap schema berubah):

```bash
cd apps/api
wrangler d1 execute myma --remote --file=../../packages/db/src/migrations/0001_init.sql
```

**Secrets** (via `wrangler secret put`, atau dashboard → Worker → Settings → Secrets):

```
AGENT_KEY_ID
AGENT_KEY
CLOUDFLARE_API_TOKEN   # hanya untuk provisioning DNS Moodle (isi nanti)
CLOUDFLARE_ZONE_ID     # hanya untuk provisioning DNS Moodle (isi nanti)
MYMA_DOMAIN
ADMIN_AUTH_MODE        # "none" hanya untuk dev; "production" harus non-none + IdP
ENVIRONMENT            # "development" (dev) / "production" (real auth)
```

## 3. Routing `/api/*` ke Worker

Dashboard di `myma.kodr.site` memanggil `/api/*` (same-origin). Arahkan ke Worker:

- **Opsi A (route):** di Worker `myma-api` → Settings → Domains & Routes → add
  route `myma.kodr.site/api/*`.
- **Opsi B (Pages Functions/`_routes.json`):** proxy `/api` dari Pages ke Worker.

```
myma.kodr.site        → Pages (dashboard static)
myma.kodr.site/api/*  → Worker myma-api
```

## Catatan

- Repo ini **pnpm monorepo** (dependensi `workspace:*`). Cloudflare Pages/Workers
  support monorepo via **root directory**; install tetap dijalankan di root repo
  dengan pnpm (bukan npm) — itu sebabnya jangan biarkan wrangler auto-install npm.
- D1 (`DB`) + R2 (`BACKUPS`) binding butuh id asli; tanpa itu Worker bakal error
  saat start.