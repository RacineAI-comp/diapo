"""Core data model for the Diapo backend.

The v0.1 model is intentionally small: a single `Presentation` with a UUID primary key
(the UUID doubles as the Yjs collaboration room name, exactly like Docs uses the document
UUID). `get_abilities(user)` returns the per-user permission map the DRF serializer and the
collab (y-provider) server consume.

Permissions are deliberately PERMISSIVE in local mode (no owner, or anonymous user) so the
collab demo works with no auth wired. Once an owner is set, only the owner can update/destroy;
everyone may still retrieve (link-reader semantics), a trimmed version of Docs' link_reach.
"""

import uuid

from django.conf import settings
from django.contrib.auth import models as auth_models
from django.contrib.auth.base_user import AbstractBaseUser
from django.core.validators import RegexValidator
from django.db import models
from django.utils.translation import gettext_lazy as _


class DuplicateEmailError(Exception):
    """Raised when an OIDC sub is unknown but its email already belongs to another user."""

    def __init__(self, message=None):
        self.message = message or _(
            "This email is already associated with a different account."
        )
        super().__init__(self.message)


# OIDC subject identifier: ASCII, no whitespace (mirrors upstream Docs' sub_validator).
sub_validator = RegexValidator(
    regex=r"^[\w.@+-]+\Z",
    message=_(
        "Enter a valid sub. This value may contain only letters, numbers, and @/./+/-/_."
    ),
)


class UserManager(auth_models.UserManager):
    """Identity lookup keyed on the OIDC `sub`, with optional email fallback, same contract as
    upstream Docs' UserManager, which django-lasuite's OIDC backend calls."""

    def get_user_by_sub_or_email(self, sub, email):
        # OIDC_* settings only exist when OIDC is enabled; default sensibly otherwise.
        fallback = getattr(settings, "OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION", True)
        allow_dupes = getattr(settings, "OIDC_ALLOW_DUPLICATE_EMAILS", False)
        try:
            return self.get(sub=sub)
        except self.model.DoesNotExist as err:
            if not email:
                return None
            if fallback:
                try:
                    return self.get(email__iexact=email)
                except self.model.DoesNotExist:
                    return None
            elif self.filter(email__iexact=email).exists() and not allow_dupes:
                raise DuplicateEmailError() from err
        return None


class User(AbstractBaseUser, auth_models.PermissionsMixin):
    """OIDC-first user, keyed on the stable `sub` claim, mirrors upstream La Suite's identity
    model so the suite shares one identity shape. `admin_email` is the Django-admin login
    (USERNAME_FIELD); OIDC users authenticate by `sub`/`email`, not a password."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sub = models.CharField(
        _("sub"),
        max_length=255,
        validators=[sub_validator],
        unique=True,
        blank=True,
        null=True,
    )
    full_name = models.CharField(_("full name"), max_length=150, null=True, blank=True)
    short_name = models.CharField(
        _("short name"), max_length=100, null=True, blank=True
    )
    email = models.EmailField(_("identity email address"), blank=True, null=True)
    admin_email = models.EmailField(
        _("admin email address"), unique=True, blank=True, null=True
    )
    language = models.CharField(
        max_length=10, choices=settings.LANGUAGES, null=True, blank=True, default=None
    )
    is_staff = models.BooleanField(_("staff status"), default=False)
    is_active = models.BooleanField(_("active"), default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "admin_email"
    REQUIRED_FIELDS = []

    class Meta:
        db_table = "slides_user"
        verbose_name = _("user")
        verbose_name_plural = _("users")

    def __str__(self):
        return self.email or self.admin_email or str(self.id)

    def get_full_name(self):
        return self.full_name or ""

    def get_short_name(self):
        return self.short_name or ""


class Presentation(models.Model):
    """A collaborative slide deck.

    `id` is a UUIDv4 and is reused verbatim as the Yjs room / document name so the collab
    server can look the presentation up by `documentName`.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text="UUIDv4, also the Yjs collaboration room name.",
    )
    title = models.CharField(max_length=255, default="Untitled presentation")

    # The deck content is held authoritatively in the Yjs document (persisted by the collab
    # server). We keep an OPTIONAL snapshot/seed here (e.g. base64 Yjs state or JSON) so the
    # backend can serve an initial render or export without the collab server running.
    content = models.TextField(
        blank=True,
        default="",
        help_text="Optional content snapshot (e.g. base64 Yjs state or JSON). Authoritative "
        "live state lives in the collab server.",
    )

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="presentations",
        help_text="Nullable: anonymous/local decks have no owner and are world-editable.",
    )

    class LinkRole(models.TextChoices):
        READER = "reader", "Lecture seule"
        EDITOR = "editor", "Édition"

    # Access granted to anyone who opens the deck's link (link-share, à la Docs link_role).
    # Defaults to 'reader': once a deck has an owner (real auth), it is PRIVATE, only the owner
    # edits unless the link is explicitly promoted to 'editor'. Ownerless decks stay world-editable
    # via get_abilities (the no-auth local demo), independent of this field.
    link_role = models.CharField(
        max_length=8,
        choices=LinkRole.choices,
        default=LinkRole.READER,
        help_text="Access for anyone with the link: 'reader' (read-only) or 'editor'.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        verbose_name = "presentation"
        verbose_name_plural = "presentations"

    def __str__(self) -> str:
        return f"{self.title} ({self.id})"

    def get_abilities(self, user) -> dict:
        """Return the permission map for ``user`` on this presentation.

        Local/permissive rules (a trimmed mirror of Docs' ability computation):

        * No owner set  -> world-editable (the local demo case).
        * Owner set, anonymous or non-owner user -> read-only (can retrieve, cannot mutate).
        * Owner set, owner is the user -> full control.

        Keys are a stable superset of what the frontend and the y-provider need.
        """
        is_authenticated = bool(getattr(user, "is_authenticated", False))
        has_owner = self.owner_id is not None

        # Ownerless decks stay world-editable (the no-auth local demo). Owned decks are private:
        # only the owner, or anyone given an explicit 'editor' link, may edit.
        is_owner = (
            has_owner
            and is_authenticated
            and self.owner_id == getattr(user, "pk", None)
        )
        link_editor = self.link_role == self.LinkRole.EDITOR
        can_update = is_owner or not has_owner or link_editor

        # Retrieval follows the link-share role: the owner always, ownerless demo decks stay
        # open, and link-shared decks are readable by anyone holding the link.
        can_retrieve = (
            is_owner
            or not has_owner
            or self.link_role in (self.LinkRole.READER, self.LinkRole.EDITOR)
        )

        return {
            "retrieve": can_retrieve,
            "update": can_update,
            "partial_update": can_update,
            "destroy": is_owner or not has_owner,
            # The collab server checks this to authorize the websocket handshake.
            "collaboration_auth": can_retrieve,
        }
