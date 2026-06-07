"""Distance helpers. Uses Mapbox Directions when configured, haversine fallback."""
from __future__ import annotations

import logging
from typing import Sequence, Tuple

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


def road_distance_km_path(points: Sequence[Tuple[float, float]]) -> float:
    """Total road distance in km over an ordered list of (lat, lng) waypoints.

    Used for the A→B→C→A pickup loop. Mapbox Directions handles up to 25
    waypoints in a single request; falls back to summed haversine legs on any
    failure or when Mapbox is not configured.
    """
    if len(points) < 2:
        return 0.0

    def haversine_sum() -> float:
        return sum(
            haversine_km(a[0], a[1], b[0], b[1])
            for a, b in zip(points, points[1:])
        )

    token = settings.MAPBOX_SECRET_TOKEN
    if not token:
        return haversine_sum()

    coords = ";".join(f"{lng},{lat}" for lat, lng in points)
    try:
        resp = requests.get(
            f"{MAPBOX_DIRECTIONS_URL}/{coords}",
            params={"access_token": token, "geometries": "geojson", "overview": "false"},
            timeout=10,
        )
        if resp.status_code != 200:
            return haversine_sum()
        routes = resp.json().get("routes") or []
        if not routes:
            return haversine_sum()
        return routes[0]["distance"] / 1000.0
    except requests.RequestException as exc:
        logger.warning("Mapbox path Directions failed (%s) — falling back to haversine", exc)
        return haversine_sum()
