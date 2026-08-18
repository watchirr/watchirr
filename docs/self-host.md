# Self-host config guide

Watchirr is a single Docker container for the Household Watchlist: search Titles, gate on Streaming Coverage, Acquire into Radarr/Sonarr when needed, and record Watched (Jellyfin or by hand). This guide covers deploy, env, first-run Admin, Settings, Locale, data durability, and a short happy path.

Two deploy paths share the **same** compose shape and the **same** volume rules: **Docker Compose CLI** and **Portainer**. Do not treat them as different products.

## What you need

- Docker Engine (and Compose v2 for the CLI path), **or** Portainer with Stacks
- Network reachability from the Watchirr container to TMDB (internet), and to your Radarr, Sonarr, and Jellyfin instances
- API keys: [TMDB](https://www.themoviedb.org/settings/api); Radarr / Sonarr / Jellyfin from each app’s settings; optional [OMDb](https://www.omdbapi.com/apikey.aspx) for Public Ratings

Default host port in the repo compose files is **3001** → container **3000**.

## Environment

| Variable | Required | Meaning |
|----------|----------|---------|
| `DATA_DIR` | No (default `/data` in the image) | Directory for SQLite file `watchirr.db`. Compose maps the named volume here. |
| `DATABASE_URL` | No | If set to a `postgres://` or `postgresql://` URL, Watchirr uses Postgres instead of SQLite. **Omit it** to keep SQLite. |

SQLite vs Postgres is a **first-deploy** choice. Flipping `DATABASE_URL` on/off or changing `DATA_DIR` does **not** migrate data — you get a new empty store (and a new first-run Admin).

Local `npm run dev` writes under `./data/`. Docker uses the `watchirr-data` volume at `/data`. Those are **different** databases.

## Data durability (read this)

Default persistence is **one SQLite file** on the data volume: `/data/watchirr.db` (Compose volume name `watchirr-data`). Committed writes are durable. People lose data by destroying or abandoning that volume — not because SQLite “eats” rows.

Facts that apply to **both** Compose CLI and Portainer:

- The **image/container is disposable**; the **named volume is the database**. Recreate or update the stack without the same volume → empty DB (looks like “I lost my Admin login / Watchlist”).
- **Compose:** never run `docker compose down -v` unless you mean a factory reset. Changing the Compose **project name** creates a **new** volume (`<project>_watchirr-data`).
- **Portainer:** do **not** check **Remove volumes** when stopping, deleting, or recreating the stack. Re-deploy must keep the **same stack name** and the same named volume mapped to `/data`. A new stack name = new empty volume.
- **Bind-mount vs named volume:** a host bind path is your backup target; a named volume is not copied when you “update” the stack. Either way, keep the same mount across updates.
- **One writer only**, on **local disk**. Do not put `watchirr.db` on NFS, SMB, or a sync folder (Dropbox/Nextcloud). Do not run two replicas on the same file. (Same class of SQLite warning as Seerr/Overseerr-style apps.)
- **Backup** = copy the file while the app is stopped, or use `sqlite3 … '.backup'`, or snapshot the volume. Do not `cp` a live `watchirr.db` while the app is writing. If WAL files appear (`-wal` / `-shm`), they are part of the DB.

## Deploy: Docker Compose CLI

From a clone of this repo (or any directory that contains an equivalent compose file):

```bash
docker compose up --build -d
```

Open `http://<host>:3001`.

Stock `docker-compose.yml`:

```yaml
services:
  watchirr:
    build: .
    ports:
      - "3001:3000"
    volumes:
      - watchirr-data:/data
    environment:
      DATA_DIR: /data
      # DATABASE_URL: postgres://watchirr:watchirr@db:5432/watchirr

volumes:
  watchirr-data:
```

### Update (keep data)

```bash
docker compose up --build -d
```

Do **not** pass `-v` to `down`. Keep the same project directory / project name so Compose reuses `watchirr-data`.

### Optional Postgres

Uncomment (or set) `DATABASE_URL` to a reachable `postgres://…` URL **before** first run. Provide your own Postgres service; default Compose does not ship one.

### Stop without wiping

```bash
docker compose down          # keeps volumes
# docker compose down -v   # deletes watchirr-data — factory reset
```

## Deploy: Portainer

Use a **Stack** with the same compose as above (build from a git repo, or paste the YAML and point `build` / `image` at how you ship the image).

1. **Stacks → Add stack**. Pick a stable **stack name** and keep it forever for this Household.
2. Paste or load compose so that:
   - `/data` is mounted from a **named volume** (e.g. `watchirr-data`), and
   - `DATA_DIR=/data` is set.
3. Deploy. Open `http://<host>:3001`.

### Update / recreate (keep data)

- Redeploy the **same** stack name.
- Leave **Remove volumes** **unchecked** when deleting or recreating.
- Keep the volume → `/data` mapping identical.

If you create a second stack with a new name, Portainer allocates a **new** empty volume. That is not a migration.

## First-run Admin

On first visit with an empty store, Watchirr sends you to **/setup**.

1. Choose a login and a password (at least 8 characters; confirm must match).
2. That account is the **Admin** — the only user in the MVP.
3. Later visits use **/login**. Session cookie lasts about 30 days.

If the volume was wiped or you pointed at a new empty store, you will see setup again — that is a new database, not a forgotten password on the old one.

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
| Command | `npm run dev` or `npm run docker:dev` | `docker compose up --build` / Portainer stack |
| DB path | `./data/watchirr.db` | `/data/watchirr.db` on `watchirr-data` |
| Hot reload | Yes | No (production image) |

Smoke tests (from a source checkout): `npm run check`.
