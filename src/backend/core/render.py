"""LibreOffice + poppler page rendering, decoupled from HTTP.

`render_to_pages(file_bytes, name)` writes the bytes to its OWN temp dir, converts to PDF via
LibreOffice (unless already a PDF), rasterises one PNG per page via poppler, and returns
`{"pages": [data:image/png;base64,... , ...], "truncated": bool}`. Rendering is capped at
MAX_PAGES; longer documents get their first MAX_PAGES pages and `truncated` set. Taking bytes
(not a shared path) is what lets a Celery worker run this in a separate process/pod from the
web tier. Raises `ToolMissing` (→ 501) when soffice or pdftoppm is absent, `ConversionFailed`
(→ 422) when a step fails.
"""

import base64
import glob
import os
import subprocess
import tempfile

MAX_PAGES = 200


class ToolMissing(RuntimeError):
    """soffice or pdftoppm is not installed on the host."""


class ConversionFailed(RuntimeError):
    """A conversion/render step failed or produced no output."""


def render_to_pages(file_bytes: bytes, name: str) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, os.path.basename(name))
        with open(src, "wb") as fh:
            fh.write(file_bytes)

        pdf = src
        if not name.lower().endswith(".pdf"):
            try:
                subprocess.run(
                    [
                        "soffice",
                        "--headless",
                        "--convert-to",
                        "pdf",
                        "--outdir",
                        tmp,
                        src,
                    ],
                    check=True,
                    timeout=120,
                    capture_output=True,
                )
            except FileNotFoundError as exc:
                raise ToolMissing(
                    "LibreOffice (soffice) non installé sur le serveur."
                ) from exc
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
                raise ConversionFailed("Échec de la conversion.") from exc
            stem = os.path.splitext(os.path.basename(name))[0]
            pdf = os.path.join(tmp, stem + ".pdf")
            if not os.path.exists(pdf):
                raise ConversionFailed("Conversion PDF introuvable.")

        try:
            # Render one page past the cap so we can tell "exactly MAX_PAGES" from "more".
            subprocess.run(
                [
                    "pdftoppm",
                    "-png",
                    "-r",
                    "110",
                    "-l",
                    str(MAX_PAGES + 1),
                    pdf,
                    os.path.join(tmp, "page"),
                ],
                check=True,
                timeout=120,
                capture_output=True,
            )
        except FileNotFoundError as exc:
            raise ToolMissing(
                "poppler (pdftoppm) non installé sur le serveur."
            ) from exc
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            raise ConversionFailed("Échec du rendu des pages.") from exc

        pngs = sorted(glob.glob(os.path.join(tmp, "page*.png")))
        truncated = len(pngs) > MAX_PAGES
        pages = []
        for png in pngs[:MAX_PAGES]:
            with open(png, "rb") as img:
                pages.append(
                    "data:image/png;base64," + base64.b64encode(img.read()).decode()
                )
        return {"pages": pages, "truncated": truncated}
