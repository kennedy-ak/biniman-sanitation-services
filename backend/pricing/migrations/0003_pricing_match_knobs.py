from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("pricing", "0002_seed_default_configs"),
    ]

    operations = [
        migrations.AddField(
            model_name="pricingconfig",
            name="parallel_offer_count",
            field=models.PositiveSmallIntegerField(default=3),
        ),
        migrations.AddField(
            model_name="pricingconfig",
            name="eta_refine_top_k",
            field=models.PositiveSmallIntegerField(default=5),
        ),
        migrations.AddField(
            model_name="pricingconfig",
            name="driver_stale_after_seconds",
            field=models.PositiveIntegerField(default=120),
        ),
        migrations.AddField(
            model_name="pricingconfig",
            name="rank_weight_distance",
            field=models.DecimalField(decimal_places=2, default=Decimal("0.55"), max_digits=3),
        ),
        migrations.AddField(
            model_name="pricingconfig",
            name="rank_weight_rating",
            field=models.DecimalField(decimal_places=2, default=Decimal("0.25"), max_digits=3),
        ),
        migrations.AddField(
            model_name="pricingconfig",
            name="rank_weight_fairness",
            field=models.DecimalField(decimal_places=2, default=Decimal("0.20"), max_digits=3),
        ),
    ]
