# Changelog

## [1.0.3]

- Library Import: one-shot Admin **Import to Watchlist** from Radarr and Sonarr (Settings), skipping coverage/Acquire and entries without a TMDB id
- Watched Import: one-shot Admin **Import Watched** from Jellyfin progress, with marked / already watched / no-match counts
- Fill Library Import posters from TMDB when *arr does not provide a poster path

## [1.0.2]

- Fix confirmation dialogs (remove / acquire / mark watched) so the panel is opaque and readable over posters

## [1.0.1]

- Fix GHCR Docker image build on Next.js 16 (empty `turbopack` config so production build can run alongside the Docker-dev webpack poll hook)

## [1.0.0]

- Shared household Watchlist with Streaming Coverage gate (subscription / flatrate only)
- Discover rails: Trending, Popular, Just released, Upcoming
- Search with Public Ratings (IMDb + Tomatometer) on the selected Title
- Acquire to Radarr/Sonarr (selected seasons for TV); Admin Remove deletes local files
- Jellyfin watched sync (any playback progress) and mark-watched by hand
- Self-host via Docker: SQLite by default, optional Postgres; locales en-US and pt-BR
