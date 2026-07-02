#!/usr/bin/env python
"""Standalone proof that a Presentation + get_abilities work end to end.

Runs against an in-memory SQLite DB (no migrations file needed, no side effects). Useful as a
quick smoke test independent of the Django test runner.

Run from the backend dir:  .venv/bin/python scripts/prove_abilities.py
"""

import os
import sys
from pathlib import Path

# Make the backend package root importable regardless of cwd.
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import django


def main() -> int:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "slides.settings")
    # Force an in-memory DB so we never touch the real db.sqlite3.
    os.environ["DJANGO_DB_PATH"] = ":memory:"
    django.setup()

    from django.contrib.auth import get_user_model
    from django.contrib.auth.models import AnonymousUser
    from django.core.management import call_command

    # Build the schema in the in-memory DB.
    call_command("migrate", run_syncdb=True, verbosity=0)

    from core.models import Presentation

    User = get_user_model()
    ok = True

    def check(cond, msg):
        nonlocal ok
        print(("  PASS" if cond else "  FAIL"), msg)
        ok = ok and cond

    # 1) Ownerless deck -> world editable.
    p = Presentation.objects.create(title="Demo deck")
    print(f"Created Presentation id={p.id} (uuid v{p.id.version}) title={p.title!r}")
    a = p.get_abilities(AnonymousUser())
    print("  abilities(anon, ownerless):", a)
    check(p.id.version == 4, "primary key is a UUIDv4")
    check(
        a["retrieve"] and a["update"] and a["collaboration_auth"],
        "ownerless deck is editable",
    )
    check(
        set(a)
        == {"retrieve", "update", "partial_update", "destroy", "collaboration_auth"},
        "abilities map has exactly the documented keys",
    )

    # 2) Owned deck -> read-only for others. The user model is sub-keyed (OIDC identity),
    # there is no `username` field.
    owner = User.objects.create(sub="alice", email="alice@example.com")
    bob = User.objects.create(sub="bob", email="bob@example.com")
    owned = Presentation.objects.create(title="Owned", owner=owner)
    print("  abilities(owner, owned):   ", owned.get_abilities(owner))
    print("  abilities(non-owner, owned):", owned.get_abilities(bob))
    check(owned.get_abilities(owner)["update"], "owner can update owned deck")
    check(owned.get_abilities(owner)["destroy"], "owner can destroy owned deck")
    check(not owned.get_abilities(bob)["update"], "non-owner cannot update owned deck")
    check(
        not owned.get_abilities(bob)["destroy"], "non-owner cannot destroy owned deck"
    )
    check(
        owned.get_abilities(bob)["retrieve"], "non-owner can still retrieve owned deck"
    )

    # 3) Editor link -> anyone with the link edits, but ownership stays with the owner.
    owned.link_role = Presentation.LinkRole.EDITOR
    owned.save(update_fields=["link_role"])
    print("  abilities(non-owner, editor link):", owned.get_abilities(bob))
    check(owned.get_abilities(bob)["update"], "editor link lets non-owner update")
    check(not owned.get_abilities(bob)["destroy"], "editor link does not allow destroy")

    print("\n" + ("OK, all ability checks passed" if ok else "FAILED"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
