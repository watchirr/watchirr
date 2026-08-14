# Watchirr

Household Watchlist. Docker self-host; SQLite by default.

```bash
docker compose up --build
```

Open http://localhost:3000 — first visit creates the Admin login. Data lives on the `watchirr-data` volume.

Optional Postgres: set `DATABASE_URL` to a `postgres://` URL. Omit it to keep SQLite.

Local dev (Node 24): `npm install && npm run dev`. Smoke: `npm run check`.
