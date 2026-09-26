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
| `F1_FUEL_CORRECTION_S_PER_LAP` | `0.055` | Fuel-burn lap-time gain used to correct tyre degradation |
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
| `GET /api/qualifying-analysis` | Best laps, Q1/Q2/Q3 rankings and every push attempt |
| `GET /api/driver-analysis` | One driver's laps and performance summary |
| `GET /api/long-runs` | Long-run pace ranked by compound |
| `GET /api/long-run-comparison` | Two stints side by side |
| `GET /api/lap-telemetry` | Telemetry for a single lap |
| `GET /api/lap-comparison` | Two laps' telemetry and delta |
| `GET /api/track-layout` | Circuit trace from position data |

Sessions accept `FP1`, `FP2`, `FP3`, `SQ`, `SS`, `S`, `Q`, `R` (or names such as `Practice 1`).
Errors return `{"detail": "..."}` with `400` for invalid input, `404` when the event, session,
driver or lap doesn't exist, and `503` when F1 timing data can't be fetched.

### How the analysis works

- **Long runs** group laps by driver, stint and compound (pit in/out laps removed). A lap is excluded
  from the stint average when it is slower than 107% of the stint's best lap (cool-down or aborted
  laps), or when it sits more than max(1 s, 3 x robust spread) off a robust (Theil-Sen) trend of lap
  time against tyre age, which catches traffic and tow laps without penalising normal degradation.
  Excluded laps are still returned with a reason, and the frontend lets you toggle them back in.
- **Tyre degradation** (`tyre_degradation_per_lap`) is the slope of lap time against tyre age after
  adding back the fuel-burn gain of 0.055 s per lap since the start of the stint
  (`F1_FUEL_CORRECTION_S_PER_LAP`). `pace_dropoff_per_lap` is the uncorrected slope against lap number.
- **Qualifying** attempts are tagged with their segment (`Q1`-`Q3`, or `SQ1`-`SQ3` for sprint
  qualifying) when FastF1 can split the session, and `segments` ranks each driver's best lap per segment.

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
npm run test:e2e            # browser tests: builds the app and runs it against a mocked API
```

The browser tests (`frontend-next/e2e/`) use Playwright; run `npx playwright install chromium`
once before the first run.

API responses are declared as Pydantic models in `backend/schemas.py`. After changing them,
regenerate the OpenAPI schema and the frontend's TypeScript types (CI fails if either is stale):

```bash
python -m backend.export_openapi          # writes frontend-next/openapi.json
cd frontend-next && npm run generate:api  # writes app/lib/api-types.ts
```

CI (`.github/workflows/ci.yml`) runs the same backend, frontend and browser checks on every push to
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
