from django.db.models import ProtectedError
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from drivers.permissions import IsAdmin

from liquidgo.throttles import (
    EmailOTPRequestThrottle,
    EmailOTPVerifyThrottle,
    OTPRequestThrottle,
    OTPVerifyThrottle,
)
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Region, Role, User
from accounts.serializers import (
    EmailOTPRequestSerializer,
    EmailOTPVerifySerializer,
    OTPRequestSerializer,
    OTPVerifySerializer,
    ProfileUpdateSerializer,
    RegionSerializer,
    UserSerializer,
)
from accounts.services.email_otp import request_email_otp, verify_email_otp
from accounts.services.otp import request_otp, verify_otp


def _tokens_for(user: User) -> dict:
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([OTPRequestThrottle])
def otp_request(request):
    serializer = OTPRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    phone = data["phone"]
    channel = data.get("channel", "sms")
    email = data.get("email") or None
    request_otp(phone, purpose=data["purpose"], channel=channel, email=email)
    return Response(
        {"sent": True, "phone": phone, "channel": channel},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([OTPVerifyThrottle])
def otp_verify(request):
    serializer = OTPVerifySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    verify_otp(data["phone"], data["code"])

    user = User.objects.filter(phone=data["phone"]).first()
    if user is not None and not user.is_active:
        return Response(
            {
                "detail": (
                    "Your account has been suspended. Please contact support at "
                    "support@biniman.com for assistance."
                )
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    created = False
    if user is None:
        role = data.get("role") or Role.CUSTOMER
        user = User.objects.create_user(
            phone=data["phone"],
            role=role,
            full_name=data.get("full_name", ""),
            region_id=data.get("region_id"),
            is_phone_verified=True,
        )
        created = True
    else:
        if not user.is_phone_verified:
            user.is_phone_verified = True
            user.save(update_fields=["is_phone_verified"])

    return Response(
        {
            "user": UserSerializer(user).data,
            "tokens": _tokens_for(user),
            "created": created,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(UserSerializer(request.user).data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_profile(request):
    serializer = ProfileUpdateSerializer(request.user, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    return Response(UserSerializer(user).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([EmailOTPRequestThrottle])
def email_otp_request(request):
    serializer = EmailOTPRequestSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    request_email_otp(request.user, serializer.validated_data["email"])
    return Response({"sent": True, "email": serializer.validated_data["email"]})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([EmailOTPVerifyThrottle])
def email_otp_verify(request):
    serializer = EmailOTPVerifySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = verify_email_otp(
        request.user,
        serializer.validated_data["email"],
        serializer.validated_data["code"],
    )
    return Response(UserSerializer(user).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def regions(_request):
    qs = Region.objects.filter(is_active=True)
    return Response(RegionSerializer(qs, many=True).data)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_regions(request):
    if request.method == "GET":
        qs = Region.objects.all()
        return Response(RegionSerializer(qs, many=True).data)

    serializer = RegionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    region = serializer.save()
    return Response(RegionSerializer(region).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_region_detail(request, pk: int):
    try:
        region = Region.objects.get(pk=pk)
    except Region.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        try:
            region.delete()
        except ProtectedError:
            return Response(
                {
                    "detail": (
                        "Cannot delete: users or other records reference this region. "
                        "Deactivate it instead."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = RegionSerializer(region, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    region = serializer.save()
    return Response(RegionSerializer(region).data)
