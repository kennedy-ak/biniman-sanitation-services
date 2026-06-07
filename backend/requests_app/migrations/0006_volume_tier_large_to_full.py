from django.db import migrations


def large_to_full(apps, _schema_editor):
    ServiceRequest = apps.get_model("requests_app", "ServiceRequest")
    ServiceRequest.objects.filter(volume_tier="large").update(volume_tier="full")


def full_to_large(apps, _schema_editor):
    ServiceRequest = apps.get_model("requests_app", "ServiceRequest")
    ServiceRequest.objects.filter(volume_tier="full").update(volume_tier="large")


class Migration(migrations.Migration):
    dependencies = [
        ("requests_app", "0005_loop_pricing_request_fields"),
    ]
    operations = [migrations.RunPython(large_to_full, full_to_large)]
