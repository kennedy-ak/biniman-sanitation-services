from decimal import Decimal

from django.db import migrations

KCARP_NAME = "KCARP — Kumasi Compost & Recycling Plant"
OLD_LAT = Decimal("6.7160000")
OLD_LNG = Decimal("-1.5160000")
NEW_LAT = Decimal("6.5983125")
NEW_LNG = Decimal("-1.5840625")


def fix_coords(apps, _schema_editor):
    """Correct the seeded KCARP coordinate on DBs that ran 0007 with the old
    value. Only touches rows still at the old coordinate so admin edits are
    left untouched."""
    DisposalSite = apps.get_model("pricing", "DisposalSite")
    DisposalSite.objects.filter(
        name=KCARP_NAME, lat=OLD_LAT, lng=OLD_LNG
    ).update(lat=NEW_LAT, lng=NEW_LNG)


def revert_coords(apps, _schema_editor):
    DisposalSite = apps.get_model("pricing", "DisposalSite")
    DisposalSite.objects.filter(
        name=KCARP_NAME, lat=NEW_LAT, lng=NEW_LNG
    ).update(lat=OLD_LAT, lng=OLD_LNG)


class Migration(migrations.Migration):
    dependencies = [
        ("pricing", "0007_seed_loop_pricing"),
    ]
    operations = [migrations.RunPython(fix_coords, revert_coords)]
