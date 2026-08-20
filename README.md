# Watchirr

Household Watchlist. Docker self-host; SQLite by default.

**Self-host:** see **[docs/self-host.md](./docs/self-host.md)** — Compose CLI + Portainer, bind-mount SQLite path, Settings, Locale, happy path.

Development (hot reload):

```bash
npm install && npm run dev
```

Or in Docker: `npm run docker:dev`. Open http://localhost:3001

Self-host (published image, no hot reload):

```bash
docker compose -f docker-compose.example.yml up -d
```

Portainer: paste **`portainer-stack.yml`**.

Open http://localhost:3001 — first visit creates the Admin login. Data lives at **`./data/watchirr.db`** on the host (stop the stack before copying a backup).

Optional Postgres: uncomment the `db` block and `DATABASE_URL` in the stack file. Omit them to keep SQLite.

Smoke: `npm run check`.
