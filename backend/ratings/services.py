"""Rating aggregates + flag detection."""
from __future__ import annotations

from decimal import Decimal
from typing import Optional

from django.db.models import Avg, Count

from ratings.models import Rating

LOW_RATING_THRESHOLD = Decimal("3.5")
FLAG_WINDOW = 10  # number of recent ratings considered


def aggregate_for_user(user_id: int) -> dict:
    qs = Rating.objects.filter(rated_user_id=user_id)
    agg = qs.aggregate(avg=Avg("score"), count=Count("id"))
    avg = agg["avg"]
    return {
        "avg": float(avg) if avg is not None else None,
        "count": agg["count"] or 0,
    }


def is_user_flagged(user_id: int) -> bool:
    """Returns True when avg of last N ratings is below threshold."""
    recent = list(
        Rating.objects.filter(rated_user_id=user_id)
        .order_by("-created_at")
        .values_list("score", flat=True)[:FLAG_WINDOW]
    )
    if len(recent) < 3:
        return False
    avg = sum(recent) / len(recent)
    return Decimal(str(avg)) < LOW_RATING_THRESHOLD


def flagged_user_ids() -> list[int]:
    user_ids = (
        Rating.objects.values_list("rated_user_id", flat=True).distinct()
    )
    return [uid for uid in user_ids if is_user_flagged(uid)]
