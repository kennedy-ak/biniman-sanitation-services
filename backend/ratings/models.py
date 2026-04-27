from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Rating(models.Model):
    request = models.ForeignKey(
        "requests_app.ServiceRequest", on_delete=models.CASCADE, related_name="ratings"
    )
    rated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ratings_given"
    )
    rated_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ratings_received"
    )

    score = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    comment = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["request", "rated_by"], name="rating_unique_per_rater_per_request"
            )
        ]
        indexes = [models.Index(fields=["rated_user", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.score}★ from {self.rated_by_id} to {self.rated_user_id}"
