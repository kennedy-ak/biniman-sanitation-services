from decimal import Decimal

from django.db import migrations


def seed(apps, _schema_editor):
    Region = apps.get_model("accounts", "Region")
    PricingConfig = apps.get_model("pricing", "PricingConfig")
    for region in Region.objects.all():
        PricingConfig.objects.get_or_create(
            region=region,
            defaults={
                "base_fee_min": Decimal("30"),
                "base_fee_max": Decimal("150"),
                "distance_rate_per_km": Decimal("3"),
                "tier_small_fee": Decimal("50"),
                "tier_medium_fee": Decimal("100"),
                "tier_large_fee": Decimal("200"),
                "commission_pct": Decimal("15"),
                "matching_radius_km": 15,
                "accept_window_seconds": 60,
            },
        )


def unseed(apps, _schema_editor):
    PricingConfig = apps.get_model("pricing", "PricingConfig")
    PricingConfig.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("pricing", "0001_initial"),
        ("accounts", "0002_seed_regions"),
    ]
    operations = [migrations.RunPython(seed, unseed)]
