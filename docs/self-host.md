# Self-host config guide

Technical depth for running Watchirr in production: env, durability, full Settings, Locale, Postgres/Traefik, and edge cases.

**Start here only after the [README](../README.md)** — that doc is the stranger path (pitch → deploy → first use). This file is the long-form companion.

Two deploy paths share the **same** runtime shape: **Docker Compose CLI** (`docker-compose.example.yml`) and **Portainer** (`portainer-stack.yml`). Do not treat them as different products.

## What you need

- Docker Engine (and Compose v2 for the CLI path), **or** Portainer with Stacks
- Network reachability from the Watchirr container to TMDB (internet), and to your Radarr, Sonarr, and Jellyfin instances
- API keys: [TMDB](https://www.themoviedb.org/settings/api); Radarr / Sonarr / Jellyfin from each app’s settings; optional [OMDb](https://www.omdbapi.com/apikey.aspx) for Public Ratings

Default host port in the repo compose files is **3001** → container **3000**.

## Environment

| Variable | Required | Meaning |
|----------|----------|---------|
| `DATA_DIR` | No (default `/data` in the image) | Directory for SQLite file `watchirr.db`. Compose bind-mounts `./data` here. |
| `DATABASE_URL` | No | If set to a `postgres://` or `postgresql://` URL, Watchirr uses Postgres instead of SQLite. **Omit it** to keep SQLite. |

SQLite vs Postgres is a **first-deploy** choice. Flipping `DATABASE_URL` on/off or changing `DATA_DIR` does **not** migrate data — you get a new empty store (and a new first-run Admin).

Deploy-time env is only `DATA_DIR` and optional `DATABASE_URL`. TMDB / OMDb / *arr keys live in **Settings** after login — not in compose.

Local `npm run dev` and Docker self-host both use `./data/watchirr.db` on the host (bind mount `./data:/data` in the stack files).

## Data durability (read this)

Default persistence is **one SQLite file** on the host: **`./data/watchirr.db`** (inside the container: `/data/watchirr.db`). Committed writes are durable. People lose data by deleting or abandoning that directory — not because SQLite “eats” rows.

Facts that apply to **both** Compose CLI and Portainer:

- The **image/container is disposable**; the **`./data` bind mount is the database**. Recreate or update the stack without the same host path → empty DB (looks like “I lost my Admin login / Watchlist”).
- **Compose:** never run `docker compose down -v` unless you mean a factory reset of other named volumes (e.g. optional Postgres). Keep the same project directory so `./data` stays put.
- **Portainer:** do **not** check **Remove volumes** when stopping, deleting, or recreating the stack. Re-deploy must keep the **same stack name** and the same `./data:/data` (or absolute host path) mapping. A new stack name with a different path = new empty store.
- **One writer only**, on **local disk**. Do not put `watchirr.db` on NFS, SMB, or a sync folder (Dropbox/Nextcloud). Do not run two replicas on the same file. (Same class of SQLite warning as Seerr/Overseerr-style apps.)
- **Backup** = stop the stack, then copy `./data/watchirr.db` (and `-wal` / `-shm` if present), or use `sqlite3 … '.backup'`. Do not `cp` a live `watchirr.db` while the app is writing.

## Deploy: Docker Compose CLI

No need to build from source. From any directory that has the example file (or after `cp` from the repo):

```bash
docker compose -f docker-compose.example.yml up -d
```

Open `http://<host>:3001`.

Stock `docker-compose.example.yml` (same runtime shape as `portainer-stack.yml`):

```yaml
services:
  watchirr:
    image: ghcr.io/watchirr/watchirr:v1.0.3
    ports:
      - "3001:3000"
    volumes:
      - ./data:/data
    environment:
      DATA_DIR: /data
      # DATABASE_URL: postgres://watchirr:watchirr@db:5432/watchirr
```

Pinned image is `ghcr.io/watchirr/watchirr:v1.0.3`. `:latest` is fine for smoke tests; check [GHCR packages](https://github.com/orgs/watchirr/packages) / releases for newer tags.

### Update (keep data)

```bash
docker compose -f docker-compose.example.yml pull
docker compose -f docker-compose.example.yml up -d
```

Keep the same project directory so `./data` is reused.

### Optional Postgres

Uncomment the optional `db` service and `DATABASE_URL` in the example file **before** first run. SQLite stays the default when those stay commented.

### Optional Traefik

The example file includes a commented Traefik labels + external `proxy` network block. Uncomment those and drop standalone `ports` if you terminate TLS at Traefik.

### Stop without wiping

```bash
docker compose -f docker-compose.example.yml down
# ./data/watchirr.db remains on the host
```

## Deploy: Portainer

Paste **`portainer-stack.yml`** (same behavior as the Compose example; comments are Portainer-oriented).

1. **Stacks → Add stack**. Pick a stable **stack name** and keep it forever for this Household.
2. Paste `portainer-stack.yml` so that:
   - `./data` (or an absolute host path) is bind-mounted to `/data`, and
   - `DATA_DIR=/data` is set,
   - `image:` is the pinned GHCR tag (default `ghcr.io/watchirr/watchirr:v1.0.3`).
3. Deploy. Open `http://<host>:3001`.

Relative `./data` is resolved on the Portainer host relative to the stack’s working directory — use an absolute path if your Portainer setup needs it.

### Update / recreate (keep data)

- Redeploy the **same** stack name.
- Leave **Remove volumes** **unchecked** when deleting or recreating.
- Keep the host path → `/data` mapping identical.

If you create a second stack with a new name and a different data path, you get a **new** empty store. That is not a migration.

## First-run Admin

On first visit with an empty store, Watchirr sends you to **/setup**.

1. Choose a login and a password (at least 8 characters; confirm must match).
2. That account is the **Admin** — the only user in the MVP.
3. Later visits use **/login**. Session cookie lasts about 30 days.

If the data directory was wiped or you pointed at a new empty store, you will see setup again — that is a new database, not a forgotten password on the old one.

## Settings (Household)

After login, open **Settings**. Save after probes so defaults stick. URLs should be reachable **from inside the Watchirr container** (Docker DNS names like `http://radarr:7878` on a shared network, or host/LAN IPs).

### TMDB

1. Paste the **TMDB API key**.
2. **Load countries and services**.
3. Pick **Country** (watch-provider region).
4. Tick **Paid Services** the Household actually pays for (subscription / flatrate only). Rent and buy do **not** count as Streaming Coverage.

Without TMDB, Search cannot load Titles.

### Radarr (movies)

1. **URL** + **API key**.
2. **Load from Radarr** → choose default **root folder** and **quality profile**.
3. Per-add Acquire can override quality/folder (Seerr-style); Settings hold the defaults.

### Sonarr (TV)

1. **URL** + **API key**.
2. **Load from Sonarr** → default **root folder**, **quality profile**, and **language profile** (when Sonarr exposes one).
3. Acquire monitors **selected seasons only** (not whole-show by default). At most one series entry per Title — never double-queue.

### Jellyfin

1. **URL** + **API key**.
2. Used to mark **Watched** when any Jellyfin user has playback progress **> 0%** on that Title while it is a Watchlist Item. Manual Watched still works without Jellyfin (needed when Streaming Coverage skipped Acquire).

### OMDb (optional — Public Ratings)

| Field | Required for core flow? |
|-------|-------------------------|
| OMDb API key | **No** |

When an OMDb API key is set in Settings, Watchirr can resolve **Public Ratings** for a Title: **IMDb Rating** (0–10) and **Tomatometer** (critics %). These are catalog signals, not Household opinions. Want / Streaming Coverage / Acquire / Watched / Remove do **not** require OMDb. Without a key, Public Ratings stay absent and Still-to-watch featuring falls back to last added.

Enter the key under **Settings → OMDb**. Leave it blank to skip Public Ratings.

## Locale

UI languages: **en-US** and **pt-BR**.

Resolution order:

1. Saved Settings pick  
2. Browser language, if supported  
3. **en-US**

The Settings language picker shows flag + language name.

## Happy path (glossary)

Terms match `CONTEXT.md`.

1. **Search** Titles (TMDB id + movie/TV kind).
2. **Add to Watchlist** → Watchirr checks **Streaming Coverage** (flatrate on a configured Paid Service in the Country).
3. If covered → stay on the list for streaming; if not → **Acquire** into Radarr (movie) or Sonarr (selected seasons), unless already **In Library** (movies skip Acquire; TV can expand seasons).
4. **Watched** via Jellyfin progress > 0%, or mark by hand.
5. **Remove** (Admin): drops the Watchlist Item; if it was local / Acquired, also tells *arr to drop and delete files (optional keep-files). Streaming-only Remove stays Watchirr-only. Re-add later runs the full flow again (coverage gate → maybe Acquire).

## Development vs self-host

| | Dev | Self-host |
|---|-----|-----------|
| Command | `npm run dev` or `npm run docker:dev` | `docker compose -f docker-compose.example.yml up -d` / Portainer paste `portainer-stack.yml` |
| DB path | `./data/watchirr.db` | `./data/watchirr.db` on the host (`/data/watchirr.db` in the container) |
| Hot reload | Yes | No (GHCR image) |

Smoke tests (from a source checkout): `npm run check`.
