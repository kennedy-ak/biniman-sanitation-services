from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Role, User
from drivers.permissions import IsAdmin
from ratings.models import Rating
from ratings.serializers import (
    CreateRatingSerializer,
    RatingSerializer,
    UserRatingSummarySerializer,
)
from ratings.services import aggregate_for_user, flagged_user_ids, is_user_flagged
from requests_app.models import RequestStatus, ServiceRequest


def _other_party(request_obj: ServiceRequest, rater: User) -> User:
    """Given a rater, return the other party on the request."""
    if request_obj.customer_id == rater.id:
        if not request_obj.driver:
            raise ValidationError("This request has no driver to rate.")
        return request_obj.driver.user
    driver = getattr(rater, "driver_profile", None)
    if driver and request_obj.driver_id == driver.id:
        return request_obj.customer
    raise PermissionDenied("You are not a participant on this request.")


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_rating(request):
    serializer = CreateRatingSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    sr = get_object_or_404(ServiceRequest, pk=data["request_id"])
    if sr.status != RequestStatus.COMPLETED.value:
        raise ValidationError("Can only rate completed requests.")

    target_user = _other_party(sr, request.user)

    with transaction.atomic():
        rating, created = Rating.objects.get_or_create(
            request=sr,
            rated_by=request.user,
            defaults={
                "rated_user": target_user,
                "score": data["score"],
                "comment": data.get("comment", ""),
            },
        )
        if not created:
            raise ValidationError("You've already rated this request.")
    return Response(RatingSerializer(rating).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_ratings(request):
    given = Rating.objects.filter(rated_by=request.user)
    received = Rating.objects.filter(rated_user=request.user)
    return Response(
        {
            "given": RatingSerializer(given, many=True).data,
            "received": RatingSerializer(received, many=True).data,
            "summary": {
                **aggregate_for_user(request.user.id),
                "flagged": is_user_flagged(request.user.id),
            },
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def request_ratings(request, request_id: int):
    sr = get_object_or_404(ServiceRequest, pk=request_id)
    if request.user.role != Role.ADMIN and request.user.id not in {
        sr.customer_id, sr.driver.user_id if sr.driver else None
    }:
        raise PermissionDenied()
    qs = sr.ratings.all()
    return Response(RatingSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def user_summary(request, user_id: int):
    """Public-ish: return rating summary for any user (for driver cards, etc.)."""
    get_object_or_404(User, pk=user_id)
    summary = aggregate_for_user(user_id)
    return Response(
        UserRatingSummarySerializer(
            {"user_id": user_id, **summary, "flagged": is_user_flagged(user_id)}
        ).data
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_flagged(_request):
    ids = flagged_user_ids()
    users = User.objects.filter(pk__in=ids).select_related("region")
    out = []
    for u in users:
        summary = aggregate_for_user(u.id)
        out.append(
            {
                "user_id": u.id,
                "phone": u.phone,
                "full_name": u.full_name,
                "role": u.role,
                "avg": summary["avg"],
                "count": summary["count"],
            }
        )
    return Response(out)
