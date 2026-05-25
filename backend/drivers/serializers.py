from rest_framework import serializers

from accounts.serializers import UserSerializer
from drivers.models import Driver, DriverDocument, DocumentType, VehicleType


class DriverDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = DriverDocument
        fields = ("id", "doc_type", "file_url", "uploaded_at")
        read_only_fields = ("id", "file_url", "uploaded_at")


class DriverSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    documents = DriverDocumentSerializer(many=True, read_only=True)
    has_location = serializers.SerializerMethodField()

    def get_has_location(self, obj) -> bool:
        return obj.last_lat is not None and obj.last_lng is not None

    class Meta:
        model = Driver
        fields = (
            "id", "user", "fleet", "vehicle_reg", "vehicle_type",
            "vehicle_capacity_litres", "license_number",
            "base_fee", "momo_number", "momo_provider",
            "status", "rejection_reason", "approved_at",
            "is_online", "last_seen_at", "has_location",
            "documents", "created_at",
        )
        read_only_fields = (
            "id", "user", "status", "rejection_reason", "approved_at",
            "is_online", "last_seen_at", "has_location", "documents", "created_at",
        )


class DriverOnboardSerializer(serializers.ModelSerializer):
    class Meta:
        model = Driver
        fields = (
            "vehicle_reg", "vehicle_type", "vehicle_capacity_litres",
            "license_number", "base_fee", "momo_number", "momo_provider",
        )

    def validate_vehicle_type(self, value):
        if value not in VehicleType.values:
            raise serializers.ValidationError("Invalid vehicle type.")
        return value


class DocumentUploadSerializer(serializers.Serializer):
    doc_type = serializers.ChoiceField(choices=DocumentType.choices)
    file = serializers.FileField()


class DriverApprovalSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["approve", "reject", "suspend"])
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)
