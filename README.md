# F1 Tempo Lab

Formula 1 session analytics built on [FastF1](https://github.com/theOehrly/Fast-F1): timing classification,
driver lap breakdowns, long-run (race pace) comparison and lap-vs-lap telemetry overlays.

- **Backend**: FastAPI service (`backend/`) that loads sessions through FastF1 and serves analysis as JSON.
- **Frontend**: Next.js 16 / React 19 app (`frontend-next/`) that consumes the API.

## Getting started

Requirements: Python 3.11+ and Node.js 20.9+.

### Backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt   # or requirements.txt for runtime only
uvicorn backend.app:app --reload      # http://127.0.0.1:8000, docs at /docs
```

The first request for a session downloads it from the F1 live-timing API, which can take a while.
FastF1 caches downloads in `cache/fastf1/`.

| Environment variable | Default | Purpose |
|---|---|---|
| `F1_SESSION_CACHE_SIZE` | `8` | Loaded sessions kept in memory |
| `F1_CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated browser origins allowed to call the API; set this to your frontend's URL when deploying |

### Frontend

```bash
cd frontend-next
cp .env.local.example .env.local      # points the app at the local API
npm install
npm run dev                           # http://localhost:3000
```

## API

| Endpoint | Description |
|---|---|
| `GET /api/seasons` | Supported seasons |
| `GET /api/races?year=` | Events in a season |
| `GET /api/sessions?year=&race=` | Sessions for an event |
| `GET /api/drivers?year=&race=&session=` | Drivers in a session |
| `GET /api/session-analysis` | Fastest laps, top speeds, long runs, tyre stints |
| `GET /api/qualifying-analysis` | Best laps and every push attempt |
| `GET /api/driver-analysis` | One driver's laps and performance summary |
| `GET /api/long-runs` | Long-run pace ranked by compound |
| `GET /api/long-run-comparison` | Two stints side by side |
| `GET /api/lap-telemetry` | Telemetry for a single lap |
| `GET /api/lap-comparison` | Two laps' telemetry and delta |
| `GET /api/track-layout` | Circuit trace from position data |

Sessions accept `FP1`, `FP2`, `FP3`, `SQ`, `SS`, `S`, `Q`, `R` (or names such as `Practice 1`).
Errors return `{"detail": "..."}` with `400` for invalid input, `404` when the event, session,
driver or lap doesn't exist, and `503` when F1 timing data can't be fetched.

The CLI in `backend/main.py` prints a session analysis as JSON:

```bash
python -m backend.main --year 2025 --race "Australian Grand Prix" --session FP1 --drivers HAM LEC
```

## Development

```bash
ruff check backend          # lint
pytest                      # unit tests (offline, no FastF1 downloads)
python -m backend.smoke_test_api   # end-to-end check against live F1 data (needs network)

cd frontend-next
npm run lint && npm run typecheck && npm run build
```

CI (`.github/workflows/ci.yml`) runs the same backend and frontend checks on every push to
`main`/`dev` and on pull requests.

## Project layout

```
backend/
  app.py              FastAPI routes and error handlers
  core/               configuration and error types
  services/           FastF1 loading and analysis
  utils/              lap filters and value formatting
  tests/              pytest suite
frontend-next/app/    Next.js pages, components and styles
```

Circuit maps in `frontend-next/public/circuits/` are credited in their
[ATTRIBUTION.md](frontend-next/public/circuits/ATTRIBUTION.md).
