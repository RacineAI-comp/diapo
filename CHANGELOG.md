# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-02

### Added

- Real-time collaborative slide editing (Yjs CRDT, multiple cursors, presence).
- Free-form slide canvas: text boxes, shapes, images, video, audio, tables and charts.
- Deck theme editor: custom colours, fonts, default background, footer and logo on every slide.
- Diagram generator (process, cycle, hierarchy, pyramid, list) producing editable grouped shapes.
- Entrance, emphasis and exit animations with ordered click sequencing in the presenter.
- Spreadsheet data import: paste from Excel or LibreOffice Calc into charts and tables, CSV import.
- Rich text editing with headings, lists, colours, fonts, links and alignment.
- Themes, layouts, sections, speaker notes and slide transitions.
- Outline view for drafting and restructuring.
- PowerPoint `.pptx` import (backend) and `.pptx` / PDF export (frontend).
- Version history with named restore points.
- Optional OIDC single sign-on (Keycloak or any OpenID Connect provider), following
  La Suite numérique conventions (`django-lasuite`, `cunningham` design system).
- Accessibility features aligned with RGAA 4.1, including a built-in checker.
- Docker Compose development stack (frontend, collaboration server, backend, PostgreSQL, Redis).
