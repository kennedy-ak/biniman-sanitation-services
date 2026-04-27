from rest_framework import serializers

from accounts.models import Region, Role, User, validate_ghana_phone


class RegionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Region
        fields = ("id", "name", "code", "is_active")


class UserSerializer(serializers.ModelSerializer):
    region = RegionSerializer(read_only=True)

    class Meta:
        model = User
        fields = (
            "id", "phone", "email", "full_name", "role",
            "region", "is_phone_verified", "is_active", "created_at",
        )
        read_only_fields = ("id", "phone", "is_phone_verified", "is_active", "created_at")


class OTPRequestSerializer(serializers.Serializer):
    phone = serializers.CharField()
    purpose = serializers.ChoiceField(choices=["login", "signup"], default="login")

    def validate_phone(self, value: str) -> str:
        validate_ghana_phone(value)
        return value


class OTPVerifySerializer(serializers.Serializer):
    phone = serializers.CharField()
    code = serializers.CharField(min_length=6, max_length=6)
    role = serializers.ChoiceField(
        choices=[Role.CUSTOMER, Role.DRIVER, Role.FLEET_ADMIN],
        required=False,
        help_text="Required when registering a new account.",
    )
    full_name = serializers.CharField(required=False, allow_blank=True, max_length=120)
    region_id = serializers.IntegerField(required=False)

    def validate_phone(self, value: str) -> str:
        validate_ghana_phone(value)
        return value


class ProfileUpdateSerializer(serializers.ModelSerializer):
    region_id = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = ("full_name", "email", "region_id")

    def update(self, instance, validated_data):
        region_id = validated_data.pop("region_id", serializers.empty)
        if region_id is not serializers.empty:
            instance.region_id = region_id
        for k, v in validated_data.items():
            setattr(instance, k, v)
        instance.save()
        return instance
