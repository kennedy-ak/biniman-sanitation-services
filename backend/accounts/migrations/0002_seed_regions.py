from django.db import migrations

REGIONS = [
    ("Accra", "ACC"),
    ("Kumasi", "KSI"),
]


def seed(apps, _schema_editor):
    Region = apps.get_model("accounts", "Region")
    for name, code in REGIONS:
        Region.objects.update_or_create(code=code, defaults={"name": name, "is_active": True})


def unseed(apps, _schema_editor):
    Region = apps.get_model("accounts", "Region")
    Region.objects.filter(code__in=[c for _, c in REGIONS]).delete()


class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial")]
    operations = [migrations.RunPython(seed, unseed)]
