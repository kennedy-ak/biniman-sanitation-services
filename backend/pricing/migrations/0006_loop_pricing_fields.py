import django.db.models.deletion
from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_seed_regions"),
        ("pricing", "0005_increase_driver_stale_threshold_1800"),
    ]

    operations = [
        # New multiplicative-model fields on PricingConfig.
        migrations.AddField(
            model_name="pricingconfig",
            name="base_fee",
            field=models.DecimalField(decimal_places=2, default=Decimal("879"), max_digits=10),
        ),
        migrations.AddField(
            model_name="pricingconfig",
            name="min_billable_km",
            field=models.PositiveIntegerField(default=10),
        ),
        migrations.AddField(
            model_name="pricingconfig",
            name="small_discount_pct",
            field=models.DecimalField(decimal_places=2, default=Decimal("30"), max_digits=5),
        ),
        migrations.AddField(
            model_name="pricingconfig",
            name="medium_discount_pct",
            field=models.DecimalField(decimal_places=2, default=Decimal("15"), max_digits=5),
        ),
        migrations.AddField(
            model_name="pricingconfig",
            name="extra_trip_surcharge_pct",
            field=models.DecimalField(decimal_places=2, default=Decimal("80"), max_digits=5),
        ),
        migrations.AlterField(
            model_name="pricingconfig",
            name="distance_rate_per_km",
            field=models.DecimalField(decimal_places=2, default=Decimal("20"), max_digits=10),
        ),
        migrations.AlterField(
            model_name="pricingconfig",
            name="matching_radius_km",
            field=models.PositiveIntegerField(default=20),
        ),
        # Remove the old additive-model fields.
        migrations.RemoveField(model_name="pricingconfig", name="base_fee_min"),
        migrations.RemoveField(model_name="pricingconfig", name="base_fee_max"),
        migrations.RemoveField(model_name="pricingconfig", name="tier_small_fee"),
        migrations.RemoveField(model_name="pricingconfig", name="tier_medium_fee"),
        migrations.RemoveField(model_name="pricingconfig", name="tier_large_fee"),
        # The composite plant (point C).
        migrations.CreateModel(
            name="DisposalSite",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("lat", models.DecimalField(decimal_places=7, max_digits=10)),
                ("lng", models.DecimalField(decimal_places=7, max_digits=10)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("region", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="disposal_sites", to="accounts.region")),
            ],
            options={
                "verbose_name": "Disposal site",
                "verbose_name_plural": "Disposal sites",
            },
        ),
    ]
