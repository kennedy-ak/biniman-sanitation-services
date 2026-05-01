from django.db import migrations

SUBMETROS = [
    ("Manhyia", "KMM"),
    ("Tafo", "KTF"),
    ("Suame", "KSM"),
    ("Asokwa", "KAS"),
    ("Oforikrom", "KOF"),
    ("Asawase", "KAW"),
    ("Bantama", "KBT"),
    ("Kwadaso", "KKW"),
    ("Nhyiaeso", "KNH"),
    ("Subin", "KSB"),
]

LEGACY_CODES = ["ACC", "KSI"]


def seed(apps, _schema_editor):
    Region = apps.get_model("accounts", "Region")
    # Deactivate legacy regions (kept around in case existing users still reference them).
    Region.objects.filter(code__in=LEGACY_CODES).update(is_active=False)
    for name, code in SUBMETROS:
        Region.objects.update_or_create(
            code=code, defaults={"name": name, "is_active": True}
        )


def unseed(apps, _schema_editor):
    Region = apps.get_model("accounts", "Region")
    Region.objects.filter(code__in=[c for _, c in SUBMETROS]).delete()
    Region.objects.filter(code__in=LEGACY_CODES).update(is_active=True)


class Migration(migrations.Migration):
    dependencies = [("accounts", "0004_email_verification")]
    operations = [migrations.RunPython(seed, unseed)]
