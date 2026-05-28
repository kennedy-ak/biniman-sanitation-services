"""Increase driver_stale_after_seconds from 300 → 1800 (30 minutes).

300s (5 min) was too aggressive for real-world usage: drivers who closed their
browser without going offline would be excluded from matching within 5 minutes.
The auto_offline_stale_drivers Celery task now handles the cleanup at 15 minutes,
so the matching filter can be relaxed to 30 minutes without leaving ghost drivers
online indefinitely.
"""
from django.db import migrations, models


def increase_stale_threshold(apps, schema_editor):
    PricingConfig = apps.get_model("pricing", "PricingConfig")
    PricingConfig.objects.filter(driver_stale_after_seconds=300).update(
        driver_stale_after_seconds=1800
    )


class Migration(migrations.Migration):

    dependencies = [
        ("pricing", "0004_increase_driver_stale_threshold"),
    ]

    operations = [
        migrations.AlterField(
            model_name="pricingconfig",
            name="driver_stale_after_seconds",
            field=models.PositiveIntegerField(default=1800),
        ),
        migrations.RunPython(increase_stale_threshold, migrations.RunPython.noop),
    ]
