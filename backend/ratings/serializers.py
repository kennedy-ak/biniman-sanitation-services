from rest_framework import serializers

from ratings.models import Rating


class RatingSerializer(serializers.ModelSerializer):
    rated_by_name = serializers.CharField(source="rated_by.full_name", read_only=True)
    rated_by_phone = serializers.CharField(source="rated_by.phone", read_only=True)
    rated_user_name = serializers.CharField(source="rated_user.full_name", read_only=True)

    class Meta:
        model = Rating
        fields = (
            "id", "request", "rated_by", "rated_by_name", "rated_by_phone",
            "rated_user", "rated_user_name", "score", "comment", "created_at",
        )
        read_only_fields = (
            "id", "rated_by", "rated_by_name", "rated_by_phone",
            "rated_user", "rated_user_name", "created_at",
        )


class CreateRatingSerializer(serializers.Serializer):
    request_id = serializers.IntegerField()
    score = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(required=False, allow_blank=True, max_length=500)


class UserRatingSummarySerializer(serializers.Serializer):
    user_id = serializers.IntegerField()
    avg = serializers.FloatField(allow_null=True)
    count = serializers.IntegerField()
    flagged = serializers.BooleanField()
