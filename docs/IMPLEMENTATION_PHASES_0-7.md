# LiquidGo — Implementation Summary (Phases 0–7)

## Phase 0 — Scaffolding

The repository structure was set up under `Biniman/` with two top-level project folders (`backend/` for Django, `frontend/` for React) plus a `docs/` folder for the brand guide and a root `docker-compose.yml` for local infrastructure.

The Django backend was scaffolded with eight purpose-built apps: `accounts`, `drivers`, `fleets`, `requests_app`, `pricing`, `payments`, `ratings`, and `notifications`. Settings were split into `base`/`dev`/`prod` files driven by `django-environ` and a `.env.example`. The project ships with Django REST Framework, SimpleJWT, Channels, Celery, Redis, PostgreSQL drivers, Cloudinary, CORS headers, and supporting libraries.

The frontend was created with Vite + React 19 + TypeScript, then layered with Tailwind v4 (configured against the LiquidGo brand palette — deep green, charcoal, mustard yellow, supporting mint and sky blue), Google Fonts (Montserrat for headings, Open Sans for body), React Router, TanStack Query, Axios with a JWT interceptor, Zustand for state, and a clean `src/{api,pages,components,layouts,store,hooks,lib,types}` layout.

A Docker Compose file boots PostGIS (Postgres 16 + PostGIS) and Redis on local ports. A brand reference (`docs/BRAND.md`) was written from the user's spec.

Verified end-to-end at the end of Phase 0: Django system check passed, ASGI and Celery imports clean, frontend `npm run build` succeeded.

## Phase 1 — Foundation: Auth, Onboarding, Admin Approval

A custom Django `User` model was introduced, keyed on Ghana E.164 phone numbers (validated against `+233\d{9}`) with optional email, role enum (`customer`, `driver`, `fleet_admin`, `admin`), foreign key to a `Region`, and verification flags. The matching custom `UserManager` handles regular and superuser creation. A `Region` model was added with Accra and Kumasi seeded via a data migration.

A phone-OTP authentication system was built. The `PhoneOTP` model holds 6-digit codes with a 10-minute TTL, a 60-second per-phone cooldown, and a 5-per-hour ceiling. The `accounts.services.otp` module enforces these limits and validates codes (max 5 wrong tries). An `mNotify` SMS adapter (`notifications.services.sms`) delivers the codes; when no API key is configured it falls back to a development mock that logs OTP codes at WARNING level so they appear in the dev terminal. Verifying an OTP returns a SimpleJWT access/refresh pair.

Driver onboarding was implemented. The `Driver` model stores vehicle registration, vehicle type and capacity, license number, configurable show-up base fee, MoMo payout details, online flag with last-known coordinates, and a status field (`pending`/`approved`/`suspended`/`rejected`) with rejection-reason and approver tracking. A `DriverDocument` model holds the four required uploads (national ID, driving license, vehicle registration, EPA permit). Uploads go through a Cloudinary adapter that gracefully falls back to a deterministic mock URL when no cloud is configured.

Fleet companies got their own model (`fleets.FleetCompany`) keyed on a registration number with owner, region, and status fields. Signup converts the user's role to `fleet_admin`.

Admin approval endpoints accept/reject/suspend drivers and fleets, recording the actor and timestamp. Custom DRF permissions (`IsAdmin`, `IsDriver`, `IsFleetAdmin`) protect the right surfaces.

The frontend gained: a single OTP-based sign-in/sign-up screen (phone → code → role/name/region on first visit), a persistent auth store with token refresh, role-routed dashboards behind a `RoleGuard`, customer profile editor, a multi-section driver onboarding page (vehicle/pricing form plus four document upload slots), fleet signup form, and an admin approvals page with separate driver and fleet tabs.

Smoke verification at the end of Phase 1 confirmed the full driver flow: signup → onboarding submission → status `pending` → admin approval transitions correctly.

## Phase 2 — Core Loop: Service Request, Matching, Realtime

The pricing baseline (`pricing.PricingConfig`) was added per region with editable fields for base-fee min/max, per-km rate, three volume-tier flat fees (small/medium/large), commission percentage, matching radius, and accept window. Default configs are seeded for both seeded regions via a data migration. The `pricing.services.calculate_quote` function builds a quote (base + distance × km + tier fee), computes commission and driver payout, and returns a `Quote` dataclass.

The core `ServiceRequest` model was introduced with full status FSM: `PENDING → ASSIGNED → ACCEPTED → EN_ROUTE → ARRIVED → COMPLETED | CANCELLED | UNFULFILLED`. Illegal transitions are blocked at the model layer. Each completion stamp (`accepted_at`, `en_route_at`, `arrived_at`, `completed_at`, `cancelled_at`) is recorded automatically on transition. A snapshot of the quote and commission is stored on the request at booking time. A `RequestAssignment` join table records each offer to each driver with distance, expiry, and outcome (`pending`, `accepted`, `declined`, `timeout`, `superseded`).

The matching engine ranks online, approved, idle drivers within the configured radius using haversine distance. Drivers already offered for the same request are skipped. The cascade is implemented as Celery tasks: `start_cascade` makes the first offer; `handle_offer_timeout` runs after the 60-second window — if the offer is still pending it advances to the next-closest driver. If no candidates remain, the request is marked `UNFULFILLED`.

Channels was wired up with a JWT WebSocket auth middleware (reads `?token=...` on connect). Two consumers were added: `DriverConsumer` (subscribes the authenticated driver to a `driver-{id}` group for live offer pushes) and `RequestConsumer` (subscribes a request's customer or assigned driver to a `request-{id}` group for live status). A `requests_app.services.broadcast` module sends offer and status events across the channel layer.

Fifteen new endpoints were added under `/api/v1/requests/` covering customer create/quote/list/detail/cancel and driver online toggle, location ping, current offer fetch, accept, decline, status transitions, and active-request lookup.

The frontend gained a customer **New Request** page (region/waste-type/tier/address picker with browser geolocation, real-time quote preview, confirmation), a customer **Request Detail** page (live status timeline driven by the WebSocket), a customer **Request List**, and a much richer driver **Dashboard** with online/offline toggle (captures geolocation on flip), incoming-offer banner with countdown and accept/decline buttons, and an active-job card with status-advance buttons.

Phase 2 was smoke-verified end-to-end: customer requested a quote (≈GHS 150), created the request, cascade fired, the nearest online driver received the offer, accepted, and walked the request through `en_route → arrived → completed`.

## Phase 3 — Pricing & Payments: Paystack, Mapbox, Admin Pricing

Three new models cover the money flow: `Payment` (one per request — Paystack reference, auth URL, access code, amount, status `pending|succeeded|failed|refunded`, method `momo|card`, paid/refund timestamps); `Payout` (driver's share — recipient code, transfer code, amount, commission, status `pending|succeeded|failed`, transferred timestamp); and `WebhookEvent` (idempotency log keyed on Paystack event ID).

A complete Paystack adapter (`payments.services.paystack`) covers transaction initialize, verify, refund, transfer-recipient creation, transfer initiation, and HMAC-SHA512 webhook signature verification. When `PAYSTACK_SECRET_KEY` is empty the adapter automatically returns success with deterministic mock identifiers — every code path runs in development without external dependencies.

A Mapbox Directions adapter (`pricing.distance.road_distance_km`) replaces straight-line distance in quote calculation when `MAPBOX_SECRET_TOKEN` is configured. It picks the nearest driver via cheap haversine first, then asks Mapbox for the road distance from that driver to pickup. On any failure (no token, network error, no route) it transparently falls back to haversine.

The `payments.services.orchestrator` module coordinates the lifecycle. `initialize_payment_for_request` creates the Payment row and calls Paystack initialize. `confirm_payment` marks the row succeeded and triggers `start_cascade.delay()` — meaning matching now begins only after payment succeeds. `refund_request` reverses a successful payment via Paystack. `trigger_payout` creates a Paystack TransferRecipient for the driver's MoMo wallet and initiates the transfer; `confirm_payout_success` and `fail_payout` are called from the webhook.

The request flow was rewired:
- `create_request` no longer fires the matching cascade — it just creates the request and returns.
- The customer hits `POST /payments/init/` which creates a Payment, returns the auth URL, and (in mock mode) auto-confirms.
- On payment success the cascade fires.
- When the driver marks `completed`, `task_trigger_payout` fires the transfer.
- When a request is cancelled or marked unfulfilled, `task_refund_request` fires the refund.

The webhook (`POST /payments/webhook/`) verifies the signature, checks the idempotency log, and processes `charge.success`, `charge.failed`, `transaction.failed`, `transfer.success`, `transfer.failed`, and `transfer.reversed`.

Admin endpoints were added for pricing config (list per region, PATCH per region) and transactions (list payments, list payouts, both with optional status filter).

The frontend gained a customer **Pay** screen on `/customer/requests/:id/pay` (auto-inits, redirects on success, opens Paystack auth URL in real mode), an admin **Pricing** editor (per-region inputs for every pricing knob with live save), and an admin **Transactions** page with payments and payouts tabs.

Phase 3 was smoke-verified end-to-end with mocks: request created → payment auto-succeeded → cascade fired → driver matched and accepted → completed → payout transferred (driver received GHS 127.96, platform retained GHS 22.58 commission). When real Paystack and Mapbox keys are dropped into `.env`, no code changes are needed — the mocks self-disable.

## Phase 4 — Trust: Bidirectional Ratings and Flags

A `Rating` model holds one rating per (request, rater) pair with score 1–5 and an optional comment. The unique constraint blocks double-rating. A `ratings.services` module aggregates per-user averages and detects flagged users (average of the last 10 ratings under 3.5, with a minimum of 3 ratings before flagging kicks in).

Endpoints were added under `/api/v1/ratings/`:
- `POST /` to submit a rating (the target party is auto-determined from the rater's role and the request's participants — illegal raters are rejected; only completed requests are ratable).
- `GET /mine/` returns the ratings the user has given, the ones they've received, and a summary (`avg`, `count`, `flagged`).
- `GET /requests/{id}/` returns ratings for a specific request (visible to the customer, the assigned driver, or any admin).
- `GET /users/{id}/` returns a public summary used by other pages (driver cards, etc.).
- `GET /admin/flagged/` returns the flagged-users list with role and average.

A new endpoint `GET /requests/driver/pending-rating/` returns the most recent completed job for which the driver hasn't rated the customer yet — used by the driver dashboard to surface the rating prompt.

The frontend gained a reusable `RatingForm` component (a five-star picker, optional comment, and a re-display of an already-submitted rating to keep the form idempotent) and a small `Stars` display component. The customer **RequestDetail** now shows the driver's average rating with star display next to the driver name and prompts the customer to rate the driver once the job is `completed`. The driver **Dashboard** shows a rating prompt for the most recent unrated completed job when no active job is in flight. An admin **Flagged users** page lists users below the threshold with their role, average, and rating count.

Phase 4 was smoke-verified: a completed job was rated 4★ by the customer toward the driver and 5★ by the driver toward the customer; a second rating attempt by the same rater on the same request returned 400; the user summary endpoint returned the expected average and count.

## Phase 5 — Fleet Module: Roster, Jobs, Earnings Rollup

The fleet management surface was filled out so a fleet admin can run their company end-to-end inside LiquidGo.

A driver-invite flow was added to `fleets.views`. `POST /fleets/drivers/invite/` accepts a phone number (and optional name) — it finds or creates the corresponding `User`, links them to the fleet, and creates a placeholder `Driver` row in `pending` status (vehicle/license fields blank, ready to be filled in by the driver on first sign-in). The mNotify SMS adapter sends a welcome text ("You've been added to {Fleet Name} on LiquidGo. Sign in to complete onboarding."), again mocked when no API key is set. `DELETE /fleets/drivers/{id}/` detaches a driver from the fleet without destroying the user. `GET /fleets/drivers/` returns the roster. All endpoints are gated by an `_approved_fleet` helper that rejects any fleet whose status is not `approved`.

A jobs surface was added with `GET /fleets/jobs/` returning all `ServiceRequest`s whose driver belongs to this fleet (optional status filter, capped at 200). A payouts surface was added with `GET /fleets/payouts/` returning all `Payout` rows for the fleet's drivers.

The earnings rollup endpoint `GET /fleets/earnings/` returns a 12-week ISO-week-grouped breakdown over completed jobs: `week_start`, jobs count, gross GHS, commission GHS, and net payout GHS — plus a totals row spanning the same window. The grouping uses Django's `TruncWeek` annotation so the database does the bucketing.

The frontend fleet portal grew to four pages. The new **Dashboard** surfaces live tiles (driver count, active job count, last-12-weeks payout) plus quick links into each subpage. The **Drivers** page exposes the invite form and shows the roster with each driver's status and an online indicator, plus a remove action. The **Jobs** page renders a table of every service request tied to the fleet's drivers. The **Earnings** page combines the totals tiles, the weekly rollup table, and a recent payouts table. The fleet portal sidebar gained Drivers / Jobs / Earnings nav entries alongside the existing Overview and Company.

Phase 5 was smoke-verified end-to-end. A fleet was created and admin-approved. The fleet admin invited a driver by phone — the SMS mock fired and a `pending` driver row was created with `fleet_id` set. After the driver completed a paid job, the fleet's endpoints returned exactly what was expected: 1 job (status `completed`), 1 succeeded payout for GHS 127.96, and a one-week rollup with 1 job, GHS 150.54 gross, GHS 22.58 commission, and GHS 127.96 payout.

## Phase 6 — Admin Analytics + Dispute Resolution

A new dedicated `analytics` Django app was added to host the platform-wide reporting and admin override surfaces. It owns no models — it pulls from `requests_app`, `payments`, `drivers`, and `accounts` directly.

The overview endpoint `GET /api/v1/analytics/overview/?days=N` returns a KPI bundle for a configurable window (default 30 days, capped between 1 and 365). The bundle covers requests (total, completed, cancelled, unfulfilled, and an unfulfilled rate), money (GMV from succeeded payments, commission from completed requests, refunded total), drivers (total, approved, online right now), and total customer count.

The daily endpoint `GET /api/v1/analytics/daily/?days=N` annotates requests with `TruncDate` and groups them per day, returning total / completed / unfulfilled / cancelled counts so the frontend can render a small chart without doing the math client-side.

The top-drivers endpoint `GET /api/v1/analytics/top-drivers/?days=N` joins through to driver and user, groups by driver, sums the quote total and commission for completed jobs in the window, and returns the top 10 sorted by job count.

A disputes endpoint `GET /api/v1/analytics/disputes/` surfaces three classes of items that need human review: failed payouts (Paystack returned a failure), stuck pending payouts older than one hour (likely a webhook that never fired), and refund-pending payments (a request cancelled or unfulfilled while the payment is still in `succeeded` state).

Four admin override endpoints back the dispute resolution workflow:
- `POST /analytics/requests/{id}/refund/` — calls `payments.services.orchestrator.refund_request`, marking the payment as refunded and (when configured) calling Paystack's refund API.
- `POST /analytics/requests/{id}/payout/` — re-runs `trigger_payout` for a completed request whose payout failed or got stuck.
- `POST /analytics/requests/{id}/force-complete/` — walks a stuck request through legal status transitions until it reaches `completed`, then fires the payout. Useful when a driver disappears mid-job.
- `POST /analytics/payouts/{id}/mark-succeeded/` — manual override for the rare case Paystack succeeded the transfer but the webhook never reached us.

The frontend admin **Overview** page was rebuilt around the analytics endpoints. A window selector (7/14/30/90 days) drives three queries in parallel. Eleven KPI tiles are arranged across three rows: money tiles (GMV, commission, refunded, customers), request tiles (total, completed, unfulfilled, unfulfilled rate as a percent), and driver tiles (total, approved, online now — highlighted). Below the tiles, a CSS bar chart renders the daily-jobs series with completed-jobs in primary green stacked over total in charcoal, and a top-drivers table lists the leaderboard with name, jobs, gross, commission, and payout columns.

A new admin **Disputes** page lists every flagged item with its category badge (failed payout / stuck payout / refund pending), the affected request ID, amount, the relevant phone number, the failure reason where applicable, and a created timestamp. Each card carries the right action button — failed and stuck payouts get a "Retry payout" button, refund-pending payments get a "Force refund" button. The admin sidebar gained a **Disputes** entry.

Phase 6 was smoke-verified against existing test data: the overview reported 4 completed jobs in the 30-day window with GHS 451.62 GMV and GHS 90.32 commission across 5 drivers (4 approved and online) and 5 customers; the top-drivers list ranked correctly; the daily rollup returned the expected single-day row; and the disputes endpoint returned an empty list (system healthy with no stuck items).

## Phase 7 — Live GPS

The final piece — the customer's "where's my driver?" experience — was wired in by extending the existing Channels infrastructure rather than introducing a new transport.

The driver continues to use the HTTP endpoint `POST /api/v1/requests/driver/ping/` to report its current coordinates, but the view was extended: after persisting the new `last_lat` / `last_lng` / `last_seen_at` on the Driver row, it looks up the driver's active request (any in `ACCEPTED`, `EN_ROUTE`, or `ARRIVED` state) and, if one exists, calls a new helper `requests_app.services.broadcast.push_driver_location` that emits a `driver.location` event into the `request-{id}` channel group.

The `RequestConsumer` was extended with a matching `driver_location` handler that forwards the event to its WebSocket clients. The customer's browser, which is already subscribed to `request-{id}` for live status updates, simply gets a new event type alongside `request.status`.

On the frontend, `useRequestSocket` was reshaped to return both the latest status event and a separate `driverLoc` value (kept up to date as `driver.location` events arrive over the same socket). A new `LiveMap` component renders a Mapbox GL map with two pins: a deep-green pickup marker and a mustard-yellow truck marker for the driver, animating to the new coordinates on every update. When `VITE_MAPBOX_TOKEN` is not set the component degrades gracefully — instead of the map it shows a small card with the raw lat/lng coordinates and a hint about configuring the token.

The customer **RequestDetail** page now embeds the LiveMap whenever the request is in `accepted`, `en_route`, or `arrived` state. Until the first `driver.location` event arrives, the map shows the pickup pin alone with a small "Waiting for driver's first location ping…" hint underneath.

On the driver side, a new hook `useLocationBroadcaster` calls `navigator.geolocation.watchPosition` (high-accuracy) and posts the latest reading to the existing `/requests/driver/ping/` endpoint at most every 7 seconds. The driver dashboard activates the broadcaster only when the driver is approved, online, and has an active job — so off-duty drivers don't burn battery streaming GPS for nothing.

Phase 7 was smoke-verified at the channel layer: a customer-side subscriber was attached to the `request-{id}` group; a driver POSTed a ping (`5.6042, -0.1865`); the server returned `200 OK` and the subscriber received exactly the expected payload (`{type: 'driver.location', request_id: 6, driver_id: 6, lat: 5.6042, lng: -0.1865}`). End-to-end the same path runs in the browser — the customer's RequestDetail map updates the truck pin in real time as the driver moves.

## Where Things Stand

After all seven phases, LiquidGo is feature-complete for MVP and runs the full lifecycle end-to-end:

1. A customer signs in or signs up via phone OTP, picks a region (Accra or Kumasi), gets a JWT.
2. They open the new-request page, get a real-time quote, and confirm a booking.
3. Payment kicks off via Paystack (or auto-completes in mock mode).
4. The matching cascade fires and offers the job to the closest online, approved driver within the region's radius.
5. The driver accepts, advances the job through en-route, arrived, and completed states — sending GPS pings the whole way.
6. The customer watches the driver pin move on a Mapbox map in real time.
7. A Paystack transfer pays out the driver's share to their MoMo wallet; the platform retains its commission.
8. Both parties rate each other; a low average eventually flags a user for admin review.
9. Admins approve drivers and fleets, edit pricing per region, view all payments and payouts, watch flagged users, run analytics over selectable windows, and handle disputes (force refunds, retry payouts, force-complete stuck jobs).
10. Fleet companies invite drivers by phone, see their roster live, and watch a 12-week earnings rollup.

The supporting infrastructure — Channels for live status and live GPS, JWT auth on both REST and WebSockets, Celery for cascade timeouts and refunds and payouts, Cloudinary for documents, Mapbox for road distance and the live map, the brand-aligned UI in deep green and mustard, dev mocks for every external service — is all wired in and smoke-tested.

All seven planned phases are complete. Real keys for Paystack, mNotify, Mapbox, and Cloudinary can be dropped into `backend/.env` and `frontend/.env` without code changes — the dev mocks self-disable when their respective keys are present. Next steps for production are operational rather than code: provision a Contabo VPS, set up Postgres + Redis there, configure Daphne + Celery as systemd services behind nginx with TLS, point a domain at it via Cloudflare, register a Paystack webhook URL, and recruit the first 20–50 verified drivers in Accra ahead of the soft launch.
