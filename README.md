# LiquidGo

Liquid waste management marketplace for Ghana. Customers request septic / soak pit / industrial liquid waste removal; nearest verified driver accepts; Paystack handles payment; platform takes commission.

## Stack

- **Backend** (`backend/`): Django 5, DRF, Channels, Celery, PostgreSQL + PostGIS
- **Frontend** (`frontend/`): Vite + React + TypeScript + Tailwind + shadcn/ui
- **Infra**: Redis, Cloudinary (storage), Mapbox (maps), mNotify (SMS), Paystack (payments), FCM (push)
- **Hosting**: Contabo VPS (backend) + Vercel (frontend)

## Local Setup

### Prerequisites
- Python 3.13+
- Node 20+
- Docker Desktop (for Postgres+PostGIS and Redis)
- On Windows: GDAL libs are tricky — easiest is to run Postgres in Docker and install GDAL via OSGeo4W if you need GeoDjango locally. See `backend/README.md`.

### 1. Start Postgres + Redis
```
docker compose up -d
```

### 2. Backend
```
cd backend
python -m venv venv
venv\Scripts\activate            # Windows
pip install -r requirements.txt
copy .env.example .env           # then edit
python manage.py migrate
python manage.py runserver
```

### 3. Frontend
```
cd frontend
npm install
copy .env.example .env           # then edit
npm run dev
```

Frontend: http://localhost:5173 — Backend: http://localhost:8000

## Documentation

- `LiquidGo_Architecture_Document.pdf` — system design
- `LiquidGo_Business_Overview.pdf` — product / business
- `docs/BRAND.md` — colors and fonts

## Build Phases

| Phase | Scope | Status |
|---|---|---|
| 0 | Scaffolding | ✅ |
| 1 | Auth, onboarding, admin approval | ⏳ |
| 2 | Service request + matching + status | ⏳ |
| 3 | Pricing + Paystack | ⏳ |
| 4 | Ratings | ⏳ |
| 5 | Fleet module | ⏳ |
| 6 | Admin dashboard | ⏳ |
| 7 | Live GPS | ⏳ |
