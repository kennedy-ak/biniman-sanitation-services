from rest_framework import serializers

from accounts.serializers import RegionSerializer, UserSerializer
from fleets.models import FleetCompany


class FleetCompanySerializer(serializers.ModelSerializer):
    owner = UserSerializer(read_only=True)
    region = RegionSerializer(read_only=True)

    class Meta:
        model = FleetCompany
        fields = (
            "id", "name", "registration_number", "contact_email", "contact_phone",
            "owner", "region", "status", "rejection_reason", "approved_at", "created_at",
        )
        read_only_fields = (
            "id", "owner", "region", "status", "rejection_reason",
            "approved_at", "created_at",
        )


class FleetSignupSerializer(serializers.ModelSerializer):
    region_id = serializers.IntegerField()

    class Meta:
        model = FleetCompany
        fields = ("name", "registration_number", "contact_email", "contact_phone", "region_id")


class FleetActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["approve", "reject", "suspend"])
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)


class FleetDriverInviteSerializer(serializers.Serializer):
    phone = serializers.CharField()
    full_name = serializers.CharField(required=False, allow_blank=True, max_length=120)


class WeeklyEarningsRowSerializer(serializers.Serializer):
    week_start = serializers.DateField()
    jobs = serializers.IntegerField()
    gross = serializers.DecimalField(max_digits=12, decimal_places=2)
    commission = serializers.DecimalField(max_digits=12, decimal_places=2)
    payout = serializers.DecimalField(max_digits=12, decimal_places=2)
