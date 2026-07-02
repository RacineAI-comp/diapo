import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type * as Y from 'yjs';
import { useEditorCtx } from '../../state/editorContext';
import { getSlides, addSlide, getSlideAt, deleteSlide } from '../../crdt/slides.js';
import { getSlideSize, setSlideSize } from '../../crdt/deck.js';
import { addObject, listObjects } from '../../crdt/scene.js';
import { createTextObject, setRichParagraphs } from '../../crdt/text.js';
import type { RichParagraphInput } from '../../crdt/text';
import { Modal } from './Modal';
import { Icon } from './../ui/Icon';
import { csrfHeaders } from '../../../../lib/csrf';

// Import dialog. Two server paths (both sovereign, LibreOffice headless / python-pptx, no cloud):
//   • mode:"objects" (.pptx), the backend parses the file with python-pptx and returns native
//     scene objects (text boxes with rich runs, shapes, pictures, tables, lines). We rebuild them
//     as REAL editable objects, preserving geometry/rotation/fill/fonts/colours, not a flat image.
//   • mode:"image" (.odp/.pdf, or any .pptx that failed to parse), one PNG per page → image-slides.
// Image files import fully client-side and always work.

// One server-parsed object → a real scene object on the given slide.
function addParsedObject(slide: ReturnType<typeof getSlideAt>, obj: ParsedObject) {
  if (!slide) return;
  if (obj.type === 'text') {
    // `fill` is the box-level TEXT colour; `shapeFill` is the box BACKGROUND (shape-with-text).
    // Per-run colours live in the rich paragraphs and override the box colour.
    const id = createTextObject(slide, {
      type: 'text',
      x: obj.x,
      y: obj.y,
      w: obj.w,
      h: obj.h,
      rotation: obj.rotation,
      valign: obj.valign,
      align: obj.align,
      fontFamily: obj.fontFamily,
      fontSize: obj.fontSize,
      lineHeight: obj.lineHeight as number | undefined,
      fill: obj.fill,
      shapeFill: obj.shapeFill,
      // Shape chrome of a shape-that-contains-text (the card behind the text): border, corner
      // radius, dash and the real imported shadow. Absent on plain text boxes.
      stroke: obj.stroke as string | undefined,
      strokeWidth: obj.strokeWidth as number | undefined,
      radius: obj.radius as number | undefined,
      dash: obj.dash as 'dash' | 'dot' | undefined,
      shadowCss: obj.shadowCss as string | undefined,
      // Text-frame layout from .pptx bodyPr: padding (insets), autofit mode, and uniform paragraph
      // spacing, so imported text fills its box like PowerPoint.
      padTop: obj.padTop as number | undefined,
      padRight: obj.padRight as number | undefined,
      padBottom: obj.padBottom as number | undefined,
      padLeft: obj.padLeft as number | undefined,
      autofit: obj.autofit as 'shape' | 'norm' | undefined,
      nowrap: obj.nowrap as boolean | undefined,
      lineHeightPx: obj.lineHeightPx as number | undefined,
      spaceBefore: obj.spaceBefore as number | undefined,
      spaceAfter: obj.spaceAfter as number | undefined,
    });
    const objects = slide.get('objects') as Y.Map<Y.Map<unknown>> | undefined;
    setRichParagraphs(objects?.get(id), obj.paragraphs || []);
    return;
  }
  // Everything else is a plain (non-rich) object: copy the structured view straight through.
  const { type, ...rest } = obj;
  addObject(slide, { type, ...rest } as Parameters<typeof addObject>[1]);
}

interface ParsedObject {
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  // text
  valign?: 'top' | 'middle' | 'bottom';
  align?: 'left' | 'center' | 'right' | 'justify';
  fontFamily?: string;
  fontSize?: number;
  fill?: string;
  shapeFill?: string;
  paragraphs?: RichParagraphInput[];
  // pass-through for shape/image/table/line
  [k: string]: unknown;
}
interface ParsedSlide {
  background: string | null;
  objects: ParsedObject[];
}
type ImportResponse =
  | { mode: 'objects'; slideSize: { w: number; h: number }; slides: ParsedSlide[] }
  | { mode?: 'image'; pages: string[] };

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const ctx = useEditorCtx();
  const { doc } = ctx;
  const ref = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  const addImageSlide = (src: string) => {
    const size = getSlideSize(doc);
    const at = addSlide(doc, getSlides(doc).length);
    const slide = getSlideAt(doc, at);
    if (slide) addObject(slide, { type: 'image', src, fit: 'cover', x: 0, y: 0, w: size.w, h: size.h });
    return at;
  };

  // Rebuild a deck of parsed slides as native editable objects. Returns the last slide index.
  const addObjectSlides = (data: Extract<ImportResponse, { mode: 'objects' }>) => {
    let last = -1;
    doc.transact(() => {
      if (data.slideSize?.w && data.slideSize?.h) setSlideSize(doc, data.slideSize.w, data.slideSize.h);
      for (const s of data.slides || []) {
        const at = addSlide(doc, getSlides(doc).length);
        const slide = getSlideAt(doc, at);
        if (slide) {
          if (s.background) slide.set('background', s.background);
          for (const obj of s.objects || []) addParsedObject(slide, obj);
        }
        last = at;
      }
    });
    return last;
  };

  const onFiles = async (files: FileList) => {
    const list = Array.from(files);
    const images = list.filter((f) => f.type.startsWith('image/'));
    const docs = list.filter((f) => /\.(pptx|odp|pdf|ppt)$/i.test(f.name));

    // If the deck is just one untouched empty slide, drop it after import so the imported deck
    // doesn't start with a stray blank slide.
    const first = getSlideAt(doc, 0);
    const startedEmpty = getSlides(doc).length === 1 && !!first && listObjects(first).length === 0;

    let last = -1;
    for (const f of images) {
      const src = await new Promise<string>((res) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.readAsDataURL(f);
      });
      last = addImageSlide(src);
    }

    for (const f of docs) {
      setStatus(t('Conversion de {{name}}…', { name: f.name }));
      try {
        const fd = new FormData();
        fd.append('file', f);
        const resp = await fetch('/api/v1.0/import/', { method: 'POST', body: fd, credentials: 'include', headers: csrfHeaders() });
        if (!resp.ok) throw new Error(String(resp.status));
        const data = (await resp.json()) as ImportResponse;
        if (data.mode === 'objects') {
          const at = addObjectSlides(data);
          if (at >= 0) last = at;
        } else {
          for (const src of data.pages || []) last = addImageSlide(src);
        }
      } catch {
        setStatus(
          t('La conversion de « {{name}} » nécessite le service serveur (LibreOffice). Importez des images en attendant.', { name: f.name }),
        );
      }
    }

    if (last >= 0) {
      // Drop the original blank leading slide if the deck started empty (import appended after it).
      if (startedEmpty && getSlides(doc).length > 1) {
        deleteSlide(doc, 0);
        last -= 1;
      }
      ctx.setActiveIndex(Math.max(0, last));
      if (!status) onClose();
    }
  };

  return (
    <Modal title={t('Importer')} icon="upload_file" onClose={onClose} width={460}>
      <button className="ins-btn" style={{ width: '100%', height: 120, flexDirection: 'column' }} onClick={() => ref.current?.click()}>
        <Icon name="upload" />
        {t('Choisir des fichiers (images, .pptx, .odp, .pdf)')}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*,.pptx,.odp,.pdf,.ppt"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) void onFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <p className="ins-hint" style={{ marginTop: 12 }}>
        {t(
          'Les .pptx sont importés en objets éditables (texte, formes, images, tableaux). Les images deviennent des diapositives ; les .odp/.pdf sont rendus par le service serveur (LibreOffice, souverain, sans cloud).',
        )}
      </p>
      {status && (
        <p className="ins-hint" style={{ marginTop: 8, color: 'var(--accent)' }}>
          {status}
        </p>
      )}
    </Modal>
  );
}
