from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("requests_app", "0002_servicerequest_gate_fits_truck_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="requestassignment",
            name="batch_uuid",
            field=models.UUIDField(blank=True, db_index=True, null=True),
        ),
    ]
