// Rich-text helpers.
//
// Each text object stores its body as a Y.XmlFragment under the key 'body'. Tiptap binds to
// that fragment via y-prosemirror (Collaboration extension), so edits merge per-character
// across peers. The legacy scalar 'text' key is kept as a *derived* plain-text mirror so that
// thumbnails / scene.js#listObjects / any non-rich consumer keep working unchanged.
import * as Y from 'yjs';
import { addObject } from './scene.js';
import { isDocReadOnly } from './guard.js';
import { fontStack } from '../data/fonts';

// Y.Map key under which the rich-text Y.XmlFragment lives. Integration note:
// the rich body is at objectMap.get('body') (Y.XmlFragment); 'text' is a plain-text mirror.
export const BODY_KEY = 'body';
const LEGACY_TEXT_KEY = 'text';

// Create a text object AND its body fragment in ONE transaction, so a peer never sees the
// object without its body (which would make it lazily create a competing empty fragment, the
// classic y-prosemirror split-brain where the text never shows for the other user).
// ALWAYS create text objects through this, never via addObject directly.
export function createTextObject(slide, view) {
  if (isDocReadOnly(slide.doc)) return '';
  const doc = slide.doc;
  let id;
  const run = () => {
    id = addObject(slide, view); // sets type/geometry (+ scalar 'text' if provided in view)
    const objects = slide.get('objects');
    getTextFragment(objects.get(id)); // create + seed the body fragment, same transaction
  };
  if (doc) doc.transact(run);
  else run();
  return id;
}

// Lazily create (or return) the Y.XmlFragment that holds an object's rich text.
// If a legacy scalar 'text' value exists, seed the fragment with it once (a single paragraph).
export function getTextFragment(objectMap) {
  if (!objectMap) throw new Error('getTextFragment: objectMap is required');

  const existing = objectMap.get(BODY_KEY);
  if (existing instanceof Y.XmlFragment) return existing;

  // Read any legacy scalar text BEFORE we attach the fragment, so we can seed it once.
  const legacy = objectMap.get(LEGACY_TEXT_KEY);

  const fragment = new Y.XmlFragment();
  objectMap.set(BODY_KEY, fragment); // integrate first, then mutate

  if (typeof legacy === 'string' && legacy.length > 0) {
    seedFragment(fragment, legacy);
  }
  return fragment;
}

// Build a minimal ProseMirror-shaped document inside the fragment: one <paragraph> per line,
// each containing a single text node. This is exactly the shape y-prosemirror reads/writes,
// so Tiptap picks it up without a round-trip through the editor.
function seedFragment(fragment, text) {
  const doc = fragment.doc;
  const apply = () => {
    const lines = text.split('\n');
    const paragraphs = lines.map((line) => {
      const p = new Y.XmlElement('paragraph');
      if (line.length > 0) p.insert(0, [new Y.XmlText(line)]);
      return p;
    });
    fragment.insert(0, paragraphs);
  };
  // Group the seed into one transaction when we have a doc (keeps it atomic + a single update).
  if (doc) doc.transact(apply);
  else apply();
}

// Derive plain text from the fragment (paragraphs joined by newlines). Falls back to the
// legacy scalar when no fragment has been created yet. Used by thumbnails and tests.
export function getPlainText(objectMap) {
  if (!objectMap) return '';
  const fragment = objectMap.get(BODY_KEY);
  if (fragment instanceof Y.XmlFragment) return fragmentToPlainText(fragment);
  return objectMap.get(LEGACY_TEXT_KEY) ?? '';
}

// Replace the whole body with plain text and refresh the legacy mirror. Kept for callers that
// only have a string (e.g. programmatic / legacy paths). Rich edits go through Tiptap instead.
export function setPlainText(objectMap, value) {
  if (!objectMap || isDocReadOnly(objectMap.doc)) return;
  const text = value ?? '';
  const fragment = getTextFragment(objectMap);
  const doc = fragment.doc;
  const apply = () => {
    if (fragment.length > 0) fragment.delete(0, fragment.length);
    const lines = String(text).split('\n');
    const paragraphs = lines.map((line) => {
      const p = new Y.XmlElement('paragraph');
      if (line.length > 0) p.insert(0, [new Y.XmlText(line)]);
      return p;
    });
    fragment.insert(0, paragraphs);
    objectMap.set(LEGACY_TEXT_KEY, String(text));
  };
  if (doc) doc.transact(apply);
  else apply();
}

// Keep the scalar 'text' mirror in sync with the current fragment contents. Call this when the
// fragment changes so legacy consumers (scene.js#listObjects, thumbnails) stay accurate.
export function syncPlainTextMirror(objectMap) {
  if (!objectMap || isDocReadOnly(objectMap.doc)) return;
  const fragment = objectMap.get(BODY_KEY);
  if (!(fragment instanceof Y.XmlFragment)) return;
  const plain = fragmentToPlainText(fragment);
  if (objectMap.get(LEGACY_TEXT_KEY) !== plain) objectMap.set(LEGACY_TEXT_KEY, plain);
}

// Extract rich paragraphs for export (PPTX rich text). Each paragraph is { heading, runs[] } where
// a run is { text, bold, italic, underline, strike, color, fontFamily, fontSize, link, sub, sup }.
// Reads marks from the Y.XmlText delta (so nothing is serialized as tags).
export function getRichParagraphs(objectMap) {
  const fragment = objectMap && objectMap.get(BODY_KEY);
  if (!(fragment instanceof Y.XmlFragment)) {
    const legacy = objectMap && objectMap.get(LEGACY_TEXT_KEY);
    return typeof legacy === 'string'
      ? legacy.split('\n').map((line) => ({ heading: 0, runs: [{ text: line }] }))
      : [];
  }
  const paras = [];
  for (let i = 0; i < fragment.length; i++) {
    collectBlock(fragment.get(i), paras, null, 0);
  }
  return paras;
}

// Flatten one block node into the `paras` accumulator. Lists (bulletList/orderedList) recurse:
// each listItem's first paragraph becomes a paragraph carrying { list, level }, and any nested
// list inside that item recurses at level+1. `listKind` is 'bullet'|'number' when inside a list.
function collectBlock(block, paras, listKind, level) {
  if (!(block instanceof Y.XmlElement)) return;
  const name = block.nodeName;
  if (name === 'bulletList' || name === 'orderedList') {
    const kind = name === 'orderedList' ? 'number' : 'bullet';
    for (let i = 0; i < block.length; i++) {
      const item = block.get(i);
      if (item instanceof Y.XmlElement && item.nodeName === 'listItem') {
        collectListItem(item, paras, kind, level);
      }
    }
    return;
  }
  if (name === 'listItem') {
    collectListItem(block, paras, listKind, level);
    return;
  }
  // Plain paragraph / heading.
  const isHeading = name === 'heading';
  const heading = isHeading ? Number(block.getAttribute('level')) || 1 : 0;
  const runs = [];
  collectRuns(block, runs);
  const para = { heading, runs };
  if (listKind) {
    para.list = listKind;
    para.level = level;
  }
  // Per-paragraph spacing (imported from .pptx lnSpc/spcBef/spcAft), read back off the block attrs
  // so it survives the CRDT round-trip and the renderer can apply it.
  readSpacingAttrs(block, para);
  paras.push(para);
}

// A listItem holds a leading paragraph (the item's text) optionally followed by nested lists.
function collectListItem(item, paras, listKind, level) {
  for (let i = 0; i < item.length; i++) {
    const child = item.get(i);
    if (!(child instanceof Y.XmlElement)) continue;
    if (child.nodeName === 'bulletList' || child.nodeName === 'orderedList') {
      collectBlock(child, paras, null, level + 1); // nested list deepens the level
    } else {
      // The item's own paragraph(s) carry this item's list kind + level.
      collectBlock(child, paras, listKind, level);
    }
  }
}

// WRITER counterpart of getRichParagraphs, lay styled paragraphs into an object's body fragment.
// Each paragraph is { heading?, align?, list?, level?, runs:[{text, bold, italic, underline, strike,
// color, fontFamily, fontSize, link, sub, sup, highlight}] }. We build Y.XmlElement('paragraph'|
// 'heading') each holding a Y.XmlText whose insert(pos, text, attributes) carries the SAME marks
// getRichParagraphs reads (bold/italic/underline/strike/highlight/subscript/superscript/link{href}/
// textStyle{color,fontFamily,fontSize}). Paragraphs carrying `list:'bullet'|'number'` are grouped
// into Tiptap/y-prosemirror list nodes (bulletList/orderedList → listItem → paragraph), nested by
// `level`. Used by the .pptx importer to recreate rich text natively. Mirrors the plain-text scalar
// so thumbnails/find stay accurate. Round-trips: getRichParagraphs(set(...)) ≈ in.
export function setRichParagraphs(objectMap, paragraphs) {
  if (!objectMap || isDocReadOnly(objectMap.doc)) return;
  const fragment = getTextFragment(objectMap);
  const doc = fragment.doc;
  const list = Array.isArray(paragraphs) ? paragraphs : [];
  const apply = () => {
    if (fragment.length > 0) fragment.delete(0, fragment.length);
    const blocks = buildBlocks(list);
    // A text box must never be empty (y-prosemirror needs at least one block node).
    if (blocks.length === 0) blocks.push(new Y.XmlElement('paragraph'));
    fragment.insert(0, blocks);
    syncPlainTextMirror(objectMap);
  };
  if (doc) doc.transact(apply);
  else apply();
}

// Map a paragraph's `list` kind to the ProseMirror list node name (StarterKit).
function listNodeName(kind) {
  if (kind === 'number' || kind === 'orderedList') return 'orderedList';
  if (kind === 'bullet' || kind === 'bulletList') return 'bulletList';
  return null;
}

// Turn a flat paragraph array into top-level block nodes, grouping consecutive same-type list
// paragraphs into one list node and nesting deeper levels inside their parent listItem. Non-list
// paragraphs (and headings) stay as standalone blocks between/around lists.
function buildBlocks(paras) {
  const blocks = [];
  let i = 0;
  while (i < paras.length) {
    const kind = listNodeName(paras[i] && paras[i].list);
    if (!kind) {
      blocks.push(buildParagraph(paras[i]));
      i += 1;
      continue;
    }
    // Consume the maximal run of consecutive list paragraphs starting at level 0+ and emit one
    // list node. Mixed bullet/number runs split into separate sibling lists.
    const end = runEnd(paras, i);
    blocks.push(buildList(paras, i, end, 0));
    i = end;
  }
  return blocks;
}

// Index one past the last paragraph belonging to the same list group as paras[start], i.e. the
// maximal contiguous block of list paragraphs whose top-level (level 0) list kind matches.
function runEnd(paras, start) {
  const topKind = listNodeName(paras[start].list);
  let i = start + 1;
  while (i < paras.length) {
    const k = listNodeName(paras[i] && paras[i].list);
    if (!k) break; // a non-list paragraph ends the group
    const level = Number(paras[i].level) || 0;
    // A new level-0 item of a DIFFERENT kind starts a fresh sibling list.
    if (level === 0 && k !== topKind) break;
    i += 1;
  }
  return i;
}

// Build one list node (bulletList/orderedList) covering paras[start..end) at nesting `depth`.
// Each listItem holds a paragraph; a deeper-level following paragraph becomes a nested list
// appended inside the current listItem. Returns the Y.XmlElement list node.
function buildList(paras, start, end, depth) {
  const kind = listNodeName(paras[start].list) || 'bulletList';
  const listEl = new Y.XmlElement(kind);
  const items = [];
  const childCounts = []; // track each item's child count locally, these nodes aren't integrated
  let i = start;
  while (i < end) {
    const level = Number(paras[i].level) || 0;
    if (level < depth) break; // belongs to an ancestor list, stop here
    if (level > depth) {
      // Deeper paragraphs nest inside the previous item at this depth.
      const childKind = listNodeName(paras[i].list) || 'bulletList';
      const childEnd = nestedEnd(paras, i, end, level, childKind);
      const nested = buildList(paras, i, childEnd, level);
      if (items.length === 0) {
        // No parent item yet (malformed): start one so the nested list has a home.
        items.push(new Y.XmlElement('listItem'));
        childCounts.push(0);
      }
      const last = items.length - 1;
      // Insert at the tracked count (avoids reading .length on a not-yet-integrated Y type).
      items[last].insert(childCounts[last], [nested]);
      childCounts[last] += 1;
      i = childEnd;
      continue;
    }
    // level === depth → a normal item at this list's level.
    const item = new Y.XmlElement('listItem');
    item.insert(0, [buildParagraph(paras[i], /* asListItem */ true)]);
    items.push(item);
    childCounts.push(1);
    i += 1;
  }
  listEl.insert(0, items);
  return listEl;
}

// Extent of a nested sub-list starting at paras[start] (level `level`, kind `kind`): consume while
// paragraphs stay at >= `level`, splitting if a same-level item switches list kind.
function nestedEnd(paras, start, end, level, kind) {
  let i = start + 1;
  while (i < end) {
    const lv = Number(paras[i].level) || 0;
    if (lv < level) break;
    if (lv === level && (listNodeName(paras[i].list) || 'bulletList') !== kind) break;
    i += 1;
  }
  return i;
}

// Build one block node (paragraph or heading) with its styled runs. Inside a list item we always
// emit a 'paragraph' (StarterKit's listItem content is `paragraph block*`, not headings).
function buildParagraph(para, asListItem = false) {
  const level = asListItem ? 0 : Number(para && para.heading) || 0;
  const el = new Y.XmlElement(level > 0 ? 'heading' : 'paragraph');
  if (level > 0) el.setAttribute('level', String(level));
  // TextAlign stores alignment as a block attribute on paragraph/heading nodes.
  if (para && para.align) el.setAttribute('textAlign', para.align);
  // Per-paragraph spacing (imported from .pptx). Stored as block attributes so it round-trips the
  // CRDT and the renderer (SlideObjectView) can read it back. Ignored for normal editor paragraphs.
  writeSpacingAttrs(el, para);

  const text = new Y.XmlText();
  let pos = 0;
  for (const run of (para && para.runs) || []) {
    const str = run && typeof run.text === 'string' ? run.text : '';
    if (str.length === 0) continue;
    const attrs = runToAttributes(run);
    text.insert(pos, str, attrs);
    pos += str.length;
  }
  el.insert(0, [text]);
  return el;
}

// Map a run's style flags onto the y-prosemirror mark attributes getRichParagraphs reads back.
function runToAttributes(run) {
  const attrs = {};
  if (run.bold) attrs.bold = {};
  if (run.italic) attrs.italic = {};
  if (run.underline) attrs.underline = {};
  if (run.strike) attrs.strike = {};
  if (run.highlight) attrs.highlight = {};
  if (run.sub) attrs.subscript = {};
  if (run.sup) attrs.superscript = {};
  if (run.link) attrs.link = { href: run.link };
  // color / fontFamily / fontSize all ride on a single textStyle mark.
  const ts = {};
  if (run.color) ts.color = run.color;
  // Map the run's font through fontStack so an imported MS family (e.g. "Calibri", or the theme
  // body font) renders via its self-hosted metric clone ("Carlito, Calibri, sans-serif"), matching
  // the box-level fontStack() in SlideObjectView and the LibreOffice ground truth. fontStack is
  // idempotent on an already-resolved stack (picker values pass through unchanged).
  if (run.fontFamily) ts.fontFamily = fontStack(run.fontFamily);
  if (run.fontSize != null) {
    // Accept a number (px) or an already-formatted CSS string ("40px").
    ts.fontSize = typeof run.fontSize === 'number' ? `${run.fontSize}px` : String(run.fontSize);
  }
  if (Object.keys(ts).length > 0) attrs.textStyle = ts;
  return attrs;
}

// Per-paragraph spacing carried as block attributes (imported from .pptx; never set by the editor):
//   data-line-height   unitless multiple (lnSpc spcPct, e.g. 1.4)
//   data-line-height-px absolute line box px (lnSpc spcPts)
//   data-space-before  px (spcBef → margin-top)
//   data-space-after   px (spcAft → margin-bottom)
// These are inert in the ProseMirror schema (unknown attrs are preserved by y-prosemirror as XML
// element attributes), so they round-trip without needing a Tiptap extension; the renderer reads
// them off the rich paragraphs for layout fidelity.
const SPACING_ATTRS = [
  ['lineHeight', 'data-line-height'],
  ['lineHeightPx', 'data-line-height-px'],
  ['spaceBefore', 'data-space-before'],
  ['spaceAfter', 'data-space-after'],
];

function writeSpacingAttrs(el, para) {
  if (!para) return;
  for (const [key, attr] of SPACING_ATTRS) {
    const v = para[key];
    if (v != null && v !== '') el.setAttribute(attr, String(v));
  }
}

function readSpacingAttrs(block, para) {
  for (const [key, attr] of SPACING_ATTRS) {
    const v = block.getAttribute(attr);
    if (v != null && v !== '') {
      const n = Number(v);
      if (!Number.isNaN(n)) para[key] = n;
    }
  }
}

function collectRuns(node, runs) {
  if (node instanceof Y.XmlText) {
    for (const op of node.toDelta()) {
      if (typeof op.insert !== 'string') continue;
      const a = op.attributes || {};
      const ts = a.textStyle || {};
      runs.push({
        text: op.insert,
        bold: !!a.bold,
        italic: !!a.italic,
        underline: !!a.underline,
        strike: !!a.strike,
        highlight: !!a.highlight,
        color: ts.color,
        fontFamily: ts.fontFamily,
        fontSize: ts.fontSize, // CSS string, e.g. "40px"
        link: a.link && a.link.href,
        sub: !!a.subscript,
        sup: !!a.superscript,
      });
    }
  } else if (node instanceof Y.XmlElement || node instanceof Y.XmlFragment) {
    for (let i = 0; i < node.length; i++) collectRuns(node.get(i), runs);
  }
}

// Walk a Y.XmlFragment and collect its text. Each leaf block (paragraph/heading, including the
// paragraph inside every list item) becomes one newline-separated line. Lists/listItems are
// containers we descend into so a bulleted list of N items yields N lines (not one collapsed line).
function fragmentToPlainText(fragment) {
  const lines = [];
  for (let i = 0; i < fragment.length; i++) collectLines(fragment.get(i), lines);
  return lines.join('\n');
}

const LIST_CONTAINERS = new Set(['bulletList', 'orderedList', 'listItem']);

function collectLines(node, lines) {
  if (node instanceof Y.XmlElement && LIST_CONTAINERS.has(node.nodeName)) {
    for (let i = 0; i < node.length; i++) collectLines(node.get(i), lines);
    return;
  }
  // A leaf block (paragraph/heading) → one line.
  lines.push(nodeText(node));
}

function nodeText(node) {
  // Y.XmlText.toString() serializes formatting marks as XML-ish tags (e.g.
  // <bold><textStyle …>Titre</textStyle></bold>), that markup must NOT leak into the plain-text
  // mirror used by export/thumbnails/find. toDelta() yields the raw {insert} runs, so join those.
  if (node instanceof Y.XmlText) {
    return node
      .toDelta()
      .map((op) => (typeof op.insert === 'string' ? op.insert : ''))
      .join('');
  }
  if (node instanceof Y.XmlElement || node instanceof Y.XmlFragment) {
    let out = '';
    for (let i = 0; i < node.length; i++) out += nodeText(node.get(i));
    return out;
  }
  return '';
}
