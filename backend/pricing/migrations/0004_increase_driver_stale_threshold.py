"""Increase driver_stale_after_seconds default from 120 → 300.

120s was too tight for browser-based GPS: a stationary driver whose
watchPosition never fired would go stale within 2 minutes and be excluded
from matching even while marked online. 300s (5 min) gives the interval-based
location broadcaster enough headroom to keep drivers fresh.
"""
from django.db import migrations, models


def increase_stale_threshold(apps, schema_editor):
    PricingConfig = apps.get_model("pricing", "PricingConfig")
    PricingConfig.objects.filter(driver_stale_after_seconds=120).update(
        driver_stale_after_seconds=300
    )


class Migration(migrations.Migration):

    dependencies = [
        ("pricing", "0003_pricing_match_knobs"),
    ]

    operations = [
        migrations.AlterField(
            model_name="pricingconfig",
            name="driver_stale_after_seconds",
            field=models.PositiveIntegerField(default=300),
        ),
        migrations.RunPython(increase_stale_threshold, migrations.RunPython.noop),
    ]
