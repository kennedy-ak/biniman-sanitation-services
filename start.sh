#!/usr/bin/env bash
# Simple deploy: backend via gunicorn+uvicorn (nohup), frontend via pm2 serve.
#
# Prereqs on VPS (one-time):
#   sudo apt install -y python3-venv python3-pip nodejs npm postgresql-client
#   sudo npm i -g pm2 serve
#   # Postgres + Redis must be reachable. Easiest: docker compose up -d (uses repo's docker-compose.yml)
#
# Subdomains already proxied:
#   www.binimansanitation.com / binimansanitation.com -> 178.238.238.36:8008  (frontend)
#   bini.binimansanitation.com                        -> 178.238.238.36:8000  (backend)

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
LOGDIR="$ROOT/logs"
mkdir -p "$LOGDIR"

############### INFRA (Postgres + Redis) ###############
echo ">>> docker compose up -d (postgres + redis)"
cd "$ROOT"
docker compose up -d
echo ">>> waiting for postgres..."
until docker exec liquidgo-postgres pg_isready -U liquidgo >/dev/null 2>&1; do
  sleep 1
done
echo "    postgres ready"

############### BACKEND ###############
echo ">>> backend: venv + deps"
cd "$BACKEND"
if [ ! -d venv ]; then
  python3 -m venv venv
fi
. venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install gunicorn uvicorn[standard]

# .env must exist in backend/
if [ ! -f .env ]; then
  cat > .env <<EOF
DJANGO_SECRET_KEY=change-me-to-a-long-random-string
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=bini.binimansanitation.com,www.binimansanitation.com,binimansanitation.com,109.199.100.62,localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=https://www.binimansanitation.com,http://www.binimansanitation.com,https://binimansanitation.com,http://binimansanitation.com
DATABASE_URL=postgres://liquidgo:liquidgo@localhost:5433/liquidgo
REDIS_URL=redis://localhost:6379/0
EOF
  echo "!!! Wrote default backend/.env — edit it then re-run."
fi

export DJANGO_SETTINGS_MODULE=liquidgo.settings.prod

echo ">>> backend: migrate + collectstatic"
python manage.py migrate --noinput
python manage.py collectstatic --noinput || true

echo ">>> backend: stop old gunicorn (if any)"
pkill -f "gunicorn .*liquidgo.asgi" || true
sleep 1

echo ">>> backend: start gunicorn on :8000 (nohup)"
nohup venv/bin/gunicorn liquidgo.asgi:application \
  -k uvicorn.workers.UvicornWorker \
  -b 0.0.0.0:8000 \
  -w 3 \
  --timeout 120 \
  --access-logfile "$LOGDIR/backend.access.log" \
  --error-logfile "$LOGDIR/backend.error.log" \
  > "$LOGDIR/backend.out" 2>&1 &
echo $! > "$LOGDIR/backend.pid"
echo "    pid $(cat $LOGDIR/backend.pid)"

echo ">>> celery worker (nohup)"
pkill -f "celery -A liquidgo worker" || true
sleep 1
nohup venv/bin/celery -A liquidgo worker -l info \
  > "$LOGDIR/celery.out" 2>&1 &
echo $! > "$LOGDIR/celery.pid"

deactivate

############### FRONTEND ###############
echo ">>> frontend: install + build"
cd "$FRONTEND"

# bake API URL + Mapbox token into the build.
# Only create .env.production if it does not exist — preserves any secrets
# (VITE_MAPBOX_TOKEN, etc.) the operator has set on the VPS so redeploys
# don't wipe them. Edit the file in place to update tokens; this block won't
# clobber it.
if [ ! -f .env.production ]; then
  cat > .env.production <<EOF
VITE_API_URL=https://bini.binimansanitation.com/api/v1
VITE_MAPBOX_TOKEN=
EOF
  echo "!!! Wrote default frontend/.env.production — add VITE_MAPBOX_TOKEN then re-run."
fi

npm install
npm run build

echo ">>> frontend: pm2 serve dist on :8008"
pm2 delete liquidgo-frontend >/dev/null 2>&1 || true
pm2 serve "$FRONTEND/dist" 8008 --name liquidgo-frontend --spa
pm2 save

echo ""
echo "DONE."
echo "  frontend: http://178.238.238.36:8008  -> https://www.binimansanitation.com"
echo "  backend : http://178.238.238.36:8000  -> https://bini.binimansanitation.com"
echo "  logs    : $LOGDIR/"
echo "  stop    : pkill -F $LOGDIR/backend.pid; pkill -F $LOGDIR/celery.pid; pm2 delete liquidgo-frontend"
