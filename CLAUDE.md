# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Biniman (Django project package is still named `liquidgo`) — liquid waste removal marketplace for Ghana. Customers request a service, the backend matches the nearest verified driver via a timed offer cascade, Paystack handles payment, the platform takes commission, and the driver gets a payout to MoMo.

## Stack at a glance

- **Backend** (`backend/`): Django 5 + DRF + SimpleJWT + Channels (ASGI/WebSockets) + Celery + PostgreSQL/PostGIS + Redis. Custom `accounts.User` model keyed on Ghana E.164 phone (`+233\d{9}`).
- **Frontend** (`frontend/`): Vite + React 19 + TypeScript + Tailwind v4 + shadcn-style components, TanStack Query, Zustand, axios with JWT refresh interceptor, react-router-dom v7, mapbox-gl / react-map-gl.
- **Infra**: Postgres+PostGIS and Redis via `docker-compose.yml` (Postgres on host port **5433**, Redis on 6379).
- **External**: Paystack (payments + transfers), Mapbox (directions/maps), mNotify (SMS OTP), Cloudinary (uploads), FCM (push). Every external adapter has a deterministic mock fallback when its env var is unset — full flow runs offline.

## Common commands

### Infra
```
docker compose up -d              # postgres + redis
```

### Backend (run from `backend/`, venv activated)
```
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver        # WSGI dev server (HTTP only)
daphne -b 0.0.0.0 -p 8000 liquidgo.asgi:application   # ASGI — needed for WebSockets
celery -A liquidgo worker -l info -P solo             # -P solo required on Windows
python manage.py test <app>[.<TestCase>[.<test_method>]]   # single test selector
```
`DJANGO_SETTINGS_MODULE` defaults to `liquidgo.settings.dev` in both `manage.py` and `asgi.py`. Override with `liquidgo.settings.prod` for prod-like runs. Reads `.env` from `backend/`.

### Frontend (run from `frontend/`)
```
npm install
npm run dev        # vite, http://localhost:5173
npm run build      # tsc -b && vite build
npm run lint       # eslint .
npm run preview
```
`VITE_API_URL` defaults to `http://localhost:8000/api/v1`.

## Architecture

### Backend layout — apps under `backend/`
| App | Role |
|---|---|
| `accounts` | Custom phone-based `User`, `Region`, `PhoneOTP`, OTP service, JWT auth |
| `drivers` | `Driver` profile, `DriverDocument` uploads, online status, location |
| `fleets` | `FleetCompany`, fleet driver association |
| `requests_app` | `ServiceRequest` FSM, `RequestAssignment`, matching, Channels consumers, Celery cascade tasks (note: app folder is `requests_app` because `requests` is a reserved/PyPI name; URL prefix stays `/api/v1/requests/`) |
| `pricing` | `PricingConfig` per region, quote engine, Mapbox road-distance adapter |
| `payments` | `Payment`, `Payout`, `WebhookEvent`, Paystack adapter, lifecycle orchestrator |
| `ratings` | Bidirectional ratings, low-rating flags |
| `notifications` | mNotify SMS, FCM push, in-app — each with dev mock fallback |
| `analytics` | Admin metrics endpoints |

Settings split: `liquidgo/settings/{base,dev,prod}.py` — `dev` sets `DEBUG=True` and `CORS_ALLOW_ALL_ORIGINS=True`. URLs mounted at `/api/v1/<app>/` from `liquidgo/urls.py`. ASGI wires `JWTAuthMiddleware` (reads `?token=...` on connect) over `requests_app.routing.websocket_urlpatterns`.

DRF throttling is **scoped** for sensitive endpoints (`otp_request`, `otp_verify`, `payment_init`, `payment_verify`, `webhook`) — counters live in Redis cache so limits hold across processes. When adding a sensitive endpoint, add a scope and rate in `REST_FRAMEWORK.DEFAULT_THROTTLE_RATES`.

### The core flow (where most logic lives)

1. **Auth**: phone → OTP via `accounts.services.otp` (mNotify; logs the code in dev when no API key) → JWT pair from `rest_framework_simplejwt`. Frontend stores tokens under `biniman.access_token` / `biniman.refresh_token`; `frontend/src/api/client.ts` runs a single-flight refresh on 401.

2. **Request lifecycle** — `ServiceRequest` FSM (illegal transitions blocked at the model layer): `PENDING → ASSIGNED → ACCEPTED → EN_ROUTE → ARRIVED → COMPLETED | CANCELLED | UNFULFILLED`. Each transition stamps its timestamp automatically.

3. **Pricing** — `pricing.services.calculate_quote` = base + distance × per-km + volume-tier flat fee. Distance uses `pricing.distance.road_distance_km` (Mapbox Directions) with a haversine fallback. Quote and commission are **snapshotted onto the request at booking** so later config edits don't mutate history.

4. **Payment-then-match** — `create_request` does **not** fire matching. Customer calls `POST /payments/init/`, `payments.services.orchestrator.initialize_payment_for_request` creates the Payment and returns Paystack auth URL (or auto-confirms in mock mode). On payment success → `start_cascade.delay()`.

5. **Matching cascade** — Celery tasks in `requests_app.tasks`. `start_cascade` ranks online + approved + idle drivers within the region's matching radius by haversine distance and offers the request to the closest one with a 60s window. `handle_offer_timeout` advances to the next driver if the offer expires. Drivers already offered are skipped. No candidates left → request goes `UNFULFILLED`.

6. **Realtime** — Channels consumers in `requests_app.consumers`: `DriverConsumer` joins `driver-{id}` for live offer pushes; `RequestConsumer` joins `request-{id}` for status updates to the customer and assigned driver. Broadcast helpers in `requests_app.services.broadcast`.

7. **Webhook** — Paystack webhook is HMAC-SHA512 verified; `WebhookEvent` provides idempotency keyed on Paystack event ID. The webhook drives both `Payment` confirmation and `Payout` success/failure transitions.

### External adapter pattern
Every integration (Paystack, Mapbox, mNotify, Cloudinary, FCM) checks for its env var and returns a deterministic mock (mock IDs / haversine / logged OTP / mock URL) when missing. Preserve this: code paths must run end-to-end with no external creds.

### Frontend layout — `frontend/src/`
- `api/` — one module per backend app, all using the shared `api` axios instance from `api/client.ts`.
- `pages/{customer,driver,fleet,admin,auth}/` — role-portal pages.
- `routes.tsx` — public routes plus four role-guarded portals (`customer`, `driver`, `fleet_admin`, `admin`) wrapped in `RoleGuard` + `PortalLayout`.
- `store/auth.ts` — Zustand auth state (persists tokens to localStorage in sync with `client.ts` keys).
- `components/layout/{PublicLayout,PortalLayout}` — top-level layouts; `LiveMap.tsx`, `RatingForm.tsx`, `RoleGuard.tsx` are shared.
- Path alias: `@/*` → `src/*` (used throughout — keep imports going through it).

## Conventions worth knowing

- The Django app is `requests_app` but the URL prefix and the API client module are both `requests` — don't try to "fix" this; `requests` clashes with PyPI.
- Settings reads `.env` from the **backend/** directory (not repo root).
- Postgres host port is **5433** (compose maps 5433→5432) — connection strings must use 5433 locally.
- Default DB engine is plain `postgres`. Switching to `django.contrib.gis.db.backends.postgis` and adding `django.contrib.gis` is on the roadmap (Phase 2 spatial models). Until then, do not add `GeoDjango` types — keep using lat/lng floats + haversine.
- On Windows, Celery must run with `-P solo`.
- Throttle scopes for sensitive endpoints live in `liquidgo/throttles.py` and `settings.base.REST_FRAMEWORK.DEFAULT_THROTTLE_RATES` — both must be updated together.
- Channels JWT auth: WebSocket URLs take `?token=<access>` (see `liquidgo/ws_auth.py`).

## Reference docs in repo

- `README.md` (root) — quickstart.
- `backend/README.md` — backend-specific setup, GeoDjango / GDAL notes for Windows.
- `docs/IMPLEMENTATION_PHASES_0-7.md` — authoritative narrative of what each phase built and why; read this before making non-trivial changes to matching, pricing, or payments.
- `docs/BRAND.md` — colors and fonts.
- `LiquidGo_Architecture_Document.pdf`, `LiquidGo_Business_Overview.pdf` — system design and product context.
