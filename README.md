# Watchirr

Household Watchlist. Docker self-host; SQLite by default.

**Self-host:** see **[docs/self-host.md](./docs/self-host.md)** — Compose CLI + Portainer, volumes/SQLite warnings, Settings, Locale, happy path.

Development (hot reload):

```bash
npm install && npm run dev
```

Or in Docker: `npm run docker:dev`. Open http://localhost:3001

Self-host (production image, no hot reload):

```bash
docker compose up --build
```

Open http://localhost:3001 — first visit creates the Admin login. Data lives on the `watchirr-data` volume.

Optional Postgres: set `DATABASE_URL` to a `postgres://` URL. Omit it to keep SQLite.

Smoke: `npm run check`.
