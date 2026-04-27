"""Distance helpers. Uses Mapbox Directions when configured, haversine fallback."""
from __future__ import annotations

import logging

import requests
from django.conf import settings

from pricing.services import haversine_km

logger = logging.getLogger(__name__)

MAPBOX_DIRECTIONS_URL = "https://api.mapbox.com/directions/v5/mapbox/driving"


def road_distance_km(*, from_lat: float, from_lng: float, to_lat: float, to_lng: float) -> float:
    """Return road distance in km. Falls back to straight-line haversine on any failure."""
    token = settings.MAPBOX_SECRET_TOKEN
    if not token:
        return haversine_km(from_lat, from_lng, to_lat, to_lng)

    coords = f"{from_lng},{from_lat};{to_lng},{to_lat}"
    try:
        resp = requests.get(
            f"{MAPBOX_DIRECTIONS_URL}/{coords}",
            params={"access_token": token, "geometries": "geojson", "overview": "false"},
            timeout=10,
        )
        if resp.status_code != 200:
            return haversine_km(from_lat, from_lng, to_lat, to_lng)
        data = resp.json()
        routes = data.get("routes") or []
        if not routes:
            return haversine_km(from_lat, from_lng, to_lat, to_lng)
        return routes[0]["distance"] / 1000.0
    except requests.RequestException as exc:
        logger.warning("Mapbox Directions failed (%s) — falling back to haversine", exc)
        return haversine_km(from_lat, from_lng, to_lat, to_lng)
