"""Management command to manually re-queue the matching cascade for stuck requests."""
from django.core.management.base import BaseCommand

from requests_app.models import RequestStatus, ServiceRequest


class Command(BaseCommand):
    help = "Re-queue start_cascade for a PENDING request whose cascade never fired."

    def add_arguments(self, parser):
        parser.add_argument(
            "request_ids",
            nargs="+",
            type=int,
            help="One or more ServiceRequest PKs to retry.",
        )

    def handle(self, *args, **options):
        from requests_app.tasks import start_cascade

        for pk in options["request_ids"]:
            try:
                sr = ServiceRequest.objects.get(pk=pk)
            except ServiceRequest.DoesNotExist:
                self.stderr.write(f"Request {pk}: not found")
                continue

            if sr.status != RequestStatus.PENDING.value:
                self.stdout.write(
                    f"Request {pk}: status is '{sr.status}', skipping (only retries PENDING)."
                )
                continue

            start_cascade.delay(pk)
            self.stdout.write(self.style.SUCCESS(f"Request {pk}: cascade re-queued."))
