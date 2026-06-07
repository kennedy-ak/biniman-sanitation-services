from decimal import Decimal

from django.db import migrations

KCARP_NAME = "KCARP — Kumasi Compost & Recycling Plant"
KCARP_LAT = Decimal("6.7160000")
KCARP_LNG = Decimal("-1.5160000")


def seed(apps, _schema_editor):
    PricingConfig = apps.get_model("pricing", "PricingConfig")
    DisposalSite = apps.get_model("pricing", "DisposalSite")

    # Reseed every region's pricing to the loop-distance model values.
    PricingConfig.objects.all().update(
        base_fee=Decimal("879"),
        distance_rate_per_km=Decimal("20"),
        min_billable_km=10,
        small_discount_pct=Decimal("30"),
        medium_discount_pct=Decimal("15"),
        extra_trip_surcharge_pct=Decimal("80"),
        commission_pct=Decimal("15"),
        matching_radius_km=20,
    )

    # Seed the single composite plant (point C) if none exists yet.
    if not DisposalSite.objects.exists():
        DisposalSite.objects.create(
            name=KCARP_NAME,
            lat=KCARP_LAT,
            lng=KCARP_LNG,
            is_active=True,
        )


def unseed(apps, _schema_editor):
    DisposalSite = apps.get_model("pricing", "DisposalSite")
    DisposalSite.objects.filter(name=KCARP_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("pricing", "0006_loop_pricing_fields"),
    ]
    operations = [migrations.RunPython(seed, unseed)]
