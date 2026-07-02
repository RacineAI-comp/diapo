import { jsPDF } from 'jspdf';
import i18next from '../../../i18n';
import type * as Y from 'yjs';
import { getSlides, getSlideAt } from '../crdt/slides.js';
import { listObjects } from '../crdt/scene.js';
import { getPlainText } from '../crdt/text.js';
import { getSlideSize, getTitle } from '../crdt/deck.js';
import type { SlideObjectView } from '../crdt/scene';

function hexToRgb(hex?: string): [number, number, number] {
  if (!hex) return [255, 255, 255];
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const i = parseInt(h, 16);
  if (Number.isNaN(i)) return [255, 255, 255];
  return [(i >> 16) & 255, (i >> 8) & 255, i & 255];
}
function imgFormat(src: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (src.startsWith('data:image/jpeg') || src.startsWith('data:image/jpg')) return 'JPEG';
  if (src.startsWith('data:image/webp')) return 'WEBP';
  return 'PNG';
}

// Build a PDF from the deck's scene model (one landscape page per slide). Best-effort fidelity:
// shapes/lines/tables/text render natively; charts render as a labelled placeholder (PPTX export
// carries native charts). Tracks every object type so nothing is silently dropped.
export function exportDeckToPdf(doc: Y.Doc): void {
  const { w: W, h: H } = getSlideSize(doc);
  const title = getTitle(doc) || 'presentation';
  const pdf = new jsPDF({ orientation: W >= H ? 'landscape' : 'portrait', unit: 'pt', format: [W, H] });
  const n = getSlides(doc).length;

  for (let i = 0; i < n; i++) {
    if (i > 0) pdf.addPage([W, H], W >= H ? 'landscape' : 'portrait');
    const slide = getSlideAt(doc, i);
    if (!slide) continue;
    const objects = slide.get('objects') as Y.Map<Y.Map<unknown>> | undefined;

    const [br, bgg, bb] = hexToRgb((slide.get('background') as string) || '#ffffff');
    pdf.setFillColor(br, bgg, bb);
    pdf.rect(0, 0, W, H, 'F');

    for (const o of listObjects(slide)) {
      const fill = () => {
        const [r, g, b] = hexToRgb(o.fill || '#dbeafe');
        pdf.setFillColor(r, g, b);
      };
      const stroke = () => {
        if (o.strokeWidth) {
          const [r, g, b] = hexToRgb(o.stroke || '#0f172a');
          pdf.setDrawColor(r, g, b);
          pdf.setLineWidth(o.strokeWidth);
        }
      };

      if (o.type === 'image' && o.src) {
        try {
          pdf.addImage(o.src, imgFormat(o.src), o.x, o.y, o.w, o.h);
        } catch {
          /* skip */
        }
      } else if (o.type === 'text') {
        const text = getPlainText(objects?.get(o.id));
        if (text) {
          const [r, g, b] = hexToRgb(o.fill || '#0f172a');
          pdf.setTextColor(r, g, b);
          pdf.setFontSize(o.fontSize || 22);
          const lines = pdf.splitTextToSize(text, Math.max(16, o.w - 16));
          const align = o.align === 'center' ? 'center' : o.align === 'right' ? 'right' : 'left';
          const tx = align === 'center' ? o.x + o.w / 2 : align === 'right' ? o.x + o.w - 8 : o.x + 8;
          pdf.text(lines, tx, o.y + (o.fontSize || 22), { baseline: 'alphabetic', align });
        }
      } else if (o.type === 'line') {
        const [r, g, b] = hexToRgb(o.stroke || '#0f172a');
        pdf.setDrawColor(r, g, b);
        pdf.setLineWidth(o.strokeWidth || 3);
        pdf.line(o.x, o.y + o.h / 2, o.x + o.w, o.y + o.h / 2);
      } else if (o.type === 'icon') {
        pdf.setTextColor(...hexToRgb(o.fill || '#0f172a'));
        pdf.setFontSize(Math.min(o.w, o.h) * 0.6);
        pdf.text(o.icon || '*', o.x + o.w / 2, o.y + o.h * 0.7, { align: 'center' });
      } else if (o.type === 'table') {
        drawTable(pdf, o);
      } else if (o.type === 'chart') {
        pdf.setFillColor(241, 245, 249);
        pdf.roundedRect(o.x, o.y, o.w, o.h, 6, 6, 'F');
        pdf.setTextColor(100, 116, 139);
        pdf.setFontSize(14);
        pdf.text(i18next.t('Graphique (voir export PPTX)'), o.x + o.w / 2, o.y + o.h / 2, { align: 'center', baseline: 'middle' });
      } else if (o.type === 'video' || o.type === 'audio') {
        // PDF cannot embed playable media: draw the poster frame when we have one, else a
        // labelled placeholder box (same pattern as charts).
        let drawn = false;
        if (o.type === 'video' && o.poster) {
          try {
            pdf.addImage(o.poster, imgFormat(o.poster), o.x, o.y, o.w, o.h);
            drawn = true;
          } catch {
            /* fall back to the placeholder box */
          }
        }
        if (!drawn) {
          pdf.setFillColor(241, 245, 249);
          pdf.roundedRect(o.x, o.y, o.w, o.h, 6, 6, 'F');
          pdf.setTextColor(100, 116, 139);
          pdf.setFontSize(14);
          const label = o.type === 'video' ? i18next.t('Vidéo (voir export PPTX)') : i18next.t('Audio (voir export PPTX)');
          pdf.text(label, o.x + o.w / 2, o.y + o.h / 2, { align: 'center', baseline: 'middle' });
        }
      } else {
        // rect / ellipse / shape
        const kind = o.shape || o.type;
        fill();
        stroke();
        const style = o.strokeWidth ? 'FD' : 'F';
        if (kind === 'ellipse') pdf.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, o.h / 2, style);
        else if (kind === 'triangle') pdf.triangle(o.x + o.w / 2, o.y, o.x + o.w, o.y + o.h, o.x, o.y + o.h, style);
        else if (kind === 'diamond')
          pdf.lines([[o.w / 2, o.h / 2], [o.w / 2, -o.h / 2], [-o.w / 2, -o.h / 2], [-o.w / 2, o.h / 2]], o.x, o.y + o.h / 2, [1, 1], style, true);
        else pdf.roundedRect(o.x, o.y, o.w, o.h, o.radius ?? 8, o.radius ?? 8, style);
      }
    }
  }

  pdf.save(`${title.replace(/[^\w.-]+/g, '_')}.pdf`);
}

function drawTable(pdf: jsPDF, o: SlideObjectView) {
  const cells = o.cells || [];
  const rows = o.rows ?? cells.length;
  const cols = o.cols ?? (cells[0]?.length || 1);
  if (!rows || !cols) return;
  const cw = o.w / cols;
  const rh = o.h / rows;
  const [sr, sg, sb] = hexToRgb(o.stroke || '#cbd5e1');
  pdf.setDrawColor(sr, sg, sb);
  pdf.setLineWidth(1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = o.x + c * cw;
      const y = o.y + r * rh;
      if (r === 0) {
        const [hr, hg, hb] = hexToRgb(o.fill || '#f1f5f9');
        pdf.setFillColor(hr, hg, hb);
        pdf.rect(x, y, cw, rh, 'FD');
      } else {
        pdf.rect(x, y, cw, rh, 'D');
      }
      const text = cells[r]?.[c];
      if (text) {
        pdf.setTextColor(15, 23, 42);
        pdf.setFontSize(11);
        pdf.text(String(text), x + 4, y + rh / 2, { baseline: 'middle' });
      }
    }
  }
}
