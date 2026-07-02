"""Object-level DRF permissions enforcing `Presentation.get_abilities`.

The abilities map was previously computed and serialized for the frontend/collab server but
never enforced by the API itself; this class closes that gap.
"""

from rest_framework import permissions

# Fallback for plain APIViews (no `view.action`): map the HTTP method to an ability key.
METHOD_ABILITY = {
    "GET": "retrieve",
    "HEAD": "retrieve",
    "OPTIONS": "retrieve",
    "PUT": "update",
    "PATCH": "partial_update",
    "DELETE": "destroy",
}


class AbilitiesPermission(permissions.BasePermission):
    """Grant object access iff the matching `get_abilities(request.user)` key is truthy.

    Viewset actions map 1:1 to ability keys (retrieve/update/partial_update/destroy);
    unknown actions are denied by default.
    """

    def has_object_permission(self, request, view, obj):
        ability = getattr(view, "action", None) or METHOD_ABILITY.get(request.method)
        if ability is None:
            return False
        return bool(obj.get_abilities(request.user).get(ability, False))
