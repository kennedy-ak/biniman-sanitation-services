from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Region
from drivers.permissions import IsAdmin
from pricing.models import PricingConfig
from pricing.serializers import (
    PricingConfigSerializer,
    PricingConfigUpdateSerializer,
)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def list_configs(request):
    qs = PricingConfig.objects.select_related("region").all()
    return Response(PricingConfigSerializer(qs, many=True).data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated, IsAdmin])
def update_config(request, region_id: int):
    region = get_object_or_404(Region, pk=region_id)
    config, _ = PricingConfig.objects.get_or_create(region=region)
    serializer = PricingConfigUpdateSerializer(config, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(PricingConfigSerializer(config).data)
