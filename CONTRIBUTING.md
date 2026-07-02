# Contributing to Diapo

Thank you for your interest in improving Diapo. This project is developed in the open and welcomes
contributions.

## Before you start

- For anything beyond a small fix, open an issue to discuss the change first. This avoids duplicated
  effort and keeps larger features aligned with the roadmap.
- Read [docs/architecture.md](docs/architecture.md) and run the project locally (see the README).

This project follows a [Code of Conduct](CODE_OF_CONDUCT.md); by participating you agree to uphold
it. Every pull request must pass the continuous integration checks: ruff and the Django test suite
on the backend, and typecheck, build and the CRDT verify scripts (`verify:crdt`, `verify:deck`,
`verify:text`) on the frontend (see `.github/workflows/ci.yml`).

## Developer Certificate of Origin (DCO)

By contributing, you certify that you wrote the change or otherwise have the right to submit it
under the project license, as described by the [Developer Certificate of Origin](https://developercertificate.org/).

Sign off every commit:

```bash
git commit --signoff
```

This adds a `Signed-off-by: Your Name <your@email>` trailer using your `git` identity. Configure it
once with `git config user.name` and `git config user.email`.

## Commit messages

Follow the La Suite numérique convention: an optional gitmoji, a type, a short scope, and a concise
title, followed by a body that explains the why.

```
✨ feat(editor): add slide transition presets

Adds fade / slide-in / none transitions selectable per slide, persisted on
the deck CRDT so they survive collaboration and export.
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`. Keep the subject under 80
characters and in the imperative mood.

## Pull requests

Before requesting review, make sure the checks pass locally:

```bash
# Frontend
cd src/frontend && npm run typecheck && npm run build

# Backend
cd src/backend && uv run ruff check . && uv run python manage.py test
```

Keep pull requests focused. Large features are best split into a series of smaller, reviewable
changes.

## Reporting issues

Please include reproduction steps, the expected and actual behaviour, and your environment
(browser, OS). Security issues should be reported privately rather than in a public issue.
