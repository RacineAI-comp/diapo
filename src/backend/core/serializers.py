"""DRF serializers for the Diapo API."""

from rest_framework import serializers

from core.models import Presentation


class PresentationSerializer(serializers.ModelSerializer):
    """Serialize a Presentation, including the per-request user's abilities.

    `abilities` mirrors upstream Docs: a SerializerMethodField computed from
    `Presentation.get_abilities(request.user)`. The collab server and the frontend both read
    this map to decide read-only vs editable and which actions to surface.
    """

    abilities = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Presentation
        fields = [
            "id",
            "title",
            "content",
            "owner",
            "link_role",
            "created_at",
            "updated_at",
            "abilities",
        ]
        read_only_fields = ["id", "owner", "created_at", "updated_at", "abilities"]

    def get_abilities(self, instance) -> dict:
        """Return abilities of the requesting user on this presentation."""
        request = self.context.get("request")
        if request is None:
            # No request context (e.g. called directly): fall back to anonymous.
            from django.contrib.auth.models import AnonymousUser

            return instance.get_abilities(AnonymousUser())
        return instance.get_abilities(request.user)


class PresentationListSerializer(PresentationSerializer):
    """Lighter serializer for list views: omit the (potentially large) content snapshot."""

    class Meta(PresentationSerializer.Meta):
        fields = [
            "id",
            "title",
            "owner",
            "created_at",
            "updated_at",
            "abilities",
        ]
