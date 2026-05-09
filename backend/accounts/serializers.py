from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from accounts.models import Region, Role, User, validate_ghana_phone


def _run_password_validators(password: str, user=None) -> None:
    try:
        validate_password(password, user=user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(list(exc.messages))


def _normalize_email(value: str) -> str:
    return (value or "").strip().lower()


class RegionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Region
        fields = ("id", "name", "code", "is_active")


class UserSerializer(serializers.ModelSerializer):
    region = RegionSerializer(read_only=True)
    has_password = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id", "phone", "email", "full_name", "role",
            "region", "is_phone_verified", "is_email_verified",
            "is_active", "created_at", "has_password",
        )
        read_only_fields = (
            "id", "phone", "is_phone_verified", "is_email_verified",
            "is_active", "created_at", "has_password",
        )

    def get_has_password(self, obj) -> bool:
        return obj.has_usable_password()


class OTPRequestSerializer(serializers.Serializer):
    phone = serializers.CharField()
    purpose = serializers.ChoiceField(choices=["login", "signup"], default="login")
    channel = serializers.ChoiceField(choices=["sms", "email"], default="sms")
    email = serializers.EmailField(required=False, allow_blank=True)

    def validate_phone(self, value: str) -> str:
        validate_ghana_phone(value)
        return value

    def validate(self, attrs):
        channel = attrs.get("channel")
        email = _normalize_email(attrs.get("email") or "")
        phone = attrs.get("phone")

        if channel == "email" and not email:
            raise serializers.ValidationError(
                {"email": "Email is required when channel is 'email'."}
            )

        if channel != "email":
            return attrs

        attrs["email"] = email
        user = User.objects.filter(phone=phone).first()

        if user is not None:
            # Existing account: email channel must match the email on file.
            if not user.email:
                raise serializers.ValidationError(
                    {
                        "email": (
                            "No email is linked to this phone number yet. "
                            "Sign in with SMS first, then add your email in your profile."
                        )
                    }
                )
            if _normalize_email(user.email) != email:
                raise serializers.ValidationError(
                    {
                        "email": (
                            "This email doesn't match the one saved on your profile. "
                            "Use your profile email, or sign in via SMS."
                        )
                    }
                )
            return attrs

        # No user yet (signup via email channel): make sure the email isn't already
        # owned by someone else with a different phone.
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError(
                {
                    "email": (
                        "This email is already linked to a different account. "
                        "Sign in with that account's phone number."
                    )
                }
            )
        return attrs


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
    password = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True,
        min_length=8,
        max_length=128,
        help_text="Required when creating a new account so the user can also log in by password.",
    )

    def validate_phone(self, value: str) -> str:
        validate_ghana_phone(value)
        return value

    def validate_password(self, value: str) -> str:
        if not value:
            return value
        _run_password_validators(value)
        return value


class PasswordLoginSerializer(serializers.Serializer):
    phone = serializers.CharField()
    password = serializers.CharField(write_only=True, min_length=1, max_length=128)

    def validate_phone(self, value: str) -> str:
        validate_ghana_phone(value)
        return value


class PasswordSetSerializer(serializers.Serializer):
    current_password = serializers.CharField(
        required=False, allow_blank=True, write_only=True, max_length=128
    )
    new_password = serializers.CharField(
        write_only=True, min_length=8, max_length=128
    )

    def validate(self, attrs):
        user = self.context["request"].user
        new_password = attrs["new_password"]
        if user.has_usable_password():
            current = attrs.get("current_password") or ""
            if not current:
                raise serializers.ValidationError(
                    {"current_password": "Enter your current password to change it."}
                )
            if not user.check_password(current):
                raise serializers.ValidationError(
                    {"current_password": "Current password is incorrect."}
                )
        _run_password_validators(new_password, user=user)
        return attrs


class ProfileUpdateSerializer(serializers.ModelSerializer):
    region_id = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = User
        # Email is intentionally excluded — it must be set via the email-OTP flow.
        fields = ("full_name", "region_id")

    def update(self, instance, validated_data):
        region_id = validated_data.pop("region_id", serializers.empty)
        if region_id is not serializers.empty:
            instance.region_id = region_id
        for k, v in validated_data.items():
            setattr(instance, k, v)
        instance.save()
        return instance


class EmailOTPRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        normalized = _normalize_email(value)
        user = self.context["request"].user
        qs = User.objects.filter(email__iexact=normalized).exclude(pk=user.pk)
        if qs.exists():
            raise serializers.ValidationError(
                "This email is already linked to a different account."
            )
        return normalized


class EmailOTPVerifySerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(min_length=6, max_length=6)

    def validate_email(self, value):
        return _normalize_email(value)
