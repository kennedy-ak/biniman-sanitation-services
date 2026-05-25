from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("drivers", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="driver",
            name="online_since",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
