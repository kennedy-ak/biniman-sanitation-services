# Biniman Backend

Django 5 + DRF + Channels + Celery.

## Setup (Windows)

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# Edit .env with real values
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Health check: http://127.0.0.1:8000/api/v1/health/
Admin: http://127.0.0.1:8000/admin/

## Run ASGI (Channels) and Celery

```powershell
# Terminal 1 — ASGI
daphne -b 0.0.0.0 -p 8000 liquidgo.asgi:application

# Terminal 2 — Celery worker
celery -A liquidgo worker -l info -P solo  # -P solo on Windows
```

## GeoDjango / PostGIS Note

The base settings use the plain `postgres` engine for now. Spatial models land in Phase 2 — at that point switch `DATABASES.default.ENGINE` to `django.contrib.gis.db.backends.postgis` and add `django.contrib.gis` to `INSTALLED_APPS`.

On Windows, GeoDjango requires GDAL. Install via [OSGeo4W](https://trac.osgeo.org/osgeo4w/) and set `GDAL_LIBRARY_PATH` / `GEOS_LIBRARY_PATH` in `.env`. Until then, all non-spatial work proceeds normally.

## Apps

| App | Purpose |
|---|---|
| `accounts` | Custom User, phone OTP auth, JWT |
| `drivers` | Driver profile, docs, online status, location |
| `fleets` | Fleet companies, fleet drivers |
| `requests_app` | Service requests, matching, status FSM (`requests` is reserved) |
| `pricing` | Configurable rates, volume tiers, quote engine |
| `payments` | Paystack charges, transfers, commission ledger |
| `ratings` | Bidirectional ratings, low-rating flags |
| `notifications` | Push (FCM), SMS (mNotify), in-app |
