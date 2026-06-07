from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("requests_app", "0004_servicerequest_receipt_generated_at_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="servicerequest",
            name="num_trips",
            field=models.PositiveSmallIntegerField(default=1),
        ),
        migrations.AddField(
            model_name="servicerequest",
            name="quote_billable_distance_km",
            field=models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=8),
        ),
        migrations.AddField(
            model_name="servicerequest",
            name="quote_volume_multiplier",
            field=models.DecimalField(decimal_places=2, default=Decimal("1"), max_digits=4),
        ),
        migrations.AddField(
            model_name="servicerequest",
            name="quote_trips_multiplier",
            field=models.DecimalField(decimal_places=2, default=Decimal("1"), max_digits=4),
        ),
        migrations.RemoveField(
            model_name="servicerequest",
            name="quote_tier_fee",
        ),
        migrations.AlterField(
            model_name="servicerequest",
            name="volume_tier",
            field=models.CharField(
                choices=[("small", "Small load"), ("medium", "Medium load"), ("full", "Full load")],
                max_length=10,
            ),
        ),
    ]
