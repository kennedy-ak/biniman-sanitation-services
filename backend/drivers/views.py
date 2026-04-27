from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from drivers.models import Driver, DriverDocument, DriverStatus
from drivers.permissions import IsAdmin, IsDriver
from drivers.serializers import (
    DocumentUploadSerializer,
    DriverApprovalSerializer,
    DriverOnboardSerializer,
    DriverSerializer,
)
from drivers.services.storage import upload_document


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDriver])
def onboard(request):
    """Create or update the driver profile for the requesting user."""
    serializer = DriverOnboardSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    driver, _ = Driver.objects.update_or_create(
        user=request.user,
        defaults={**serializer.validated_data, "status": DriverStatus.PENDING},
    )
    return Response(DriverSerializer(driver).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsDriver])
def my_profile(request):
    driver = getattr(request.user, "driver_profile", None)
    if not driver:
        return Response({"detail": "No driver profile yet."}, status=status.HTTP_404_NOT_FOUND)
    return Response(DriverSerializer(driver).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDriver])
@parser_classes([MultiPartParser, FormParser])
def upload_doc(request):
    serializer = DocumentUploadSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    driver = getattr(request.user, "driver_profile", None)
    if not driver:
        return Response(
            {"detail": "Submit driver onboarding details first."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    file_obj = serializer.validated_data["file"]
    doc_type = serializer.validated_data["doc_type"]

    upload = upload_document(file_obj, folder=f"liquidgo/drivers/{driver.id}")
    doc, _ = DriverDocument.objects.update_or_create(
        driver=driver,
        doc_type=doc_type,
        defaults={"file_url": upload["url"], "public_id": upload["public_id"]},
    )
    return Response(
        {"doc_type": doc.doc_type, "file_url": doc.file_url}, status=status.HTTP_201_CREATED
    )


# --- Admin endpoints ---


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_list(request):
    qs = Driver.objects.select_related("user", "fleet").all()
    status_param = request.query_params.get("status")
    if status_param:
        qs = qs.filter(status=status_param)
    return Response(DriverSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_action(request, driver_id: int):
    driver = get_object_or_404(Driver, pk=driver_id)
    serializer = DriverApprovalSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    action = serializer.validated_data["action"]
    reason = serializer.validated_data.get("reason", "")

    if action == "approve":
        driver.status = DriverStatus.APPROVED
        driver.rejection_reason = ""
        driver.approved_at = timezone.now()
        driver.approved_by = request.user
    elif action == "reject":
        driver.status = DriverStatus.REJECTED
        driver.rejection_reason = reason
    elif action == "suspend":
        driver.status = DriverStatus.SUSPENDED
        driver.rejection_reason = reason

    driver.save()
    return Response(DriverSerializer(driver).data)
