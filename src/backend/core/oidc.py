"""OIDC authentication backend, mirrors upstream La Suite (Docs).

Subclasses django-lasuite's OIDCAuthenticationBackend (the same base impress uses), keyed on the
stable `sub` claim with email fallback, and maps the OIDC name claims onto our `sub`-User's
full_name/short_name. This replaces the earlier mozilla-stock backend so identity is consistent
with the rest of the suite.
"""

from django.core.exceptions import SuspiciousOperation

from lasuite.oidc_login.backends import OIDCAuthenticationBackend as LaSuiteOIDCBackend

from core.models import DuplicateEmailError


class SuiteOIDCBackend(LaSuiteOIDCBackend):
    def get_extra_claims(self, user_info):
        """Map standard OIDC name claims onto the User (full_name from OIDC_USERINFO_FULLNAME_FIELDS,
        short_name from OIDC_USERINFO_SHORTNAME_FIELD), same shape as upstream Docs."""
        from django.conf import settings

        return {
            "full_name": self.compute_full_name(user_info),
            "short_name": user_info.get(settings.OIDC_USERINFO_SHORTNAME_FIELD),
        }

    def get_existing_user(self, sub, email):
        """Look up by `sub`, then email, raising on an ambiguous duplicate email."""
        try:
            return self.UserModel.objects.get_user_by_sub_or_email(sub, email)
        except DuplicateEmailError as err:
            raise SuspiciousOperation(err.message) from err
