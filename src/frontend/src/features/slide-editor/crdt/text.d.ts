import type * as Y from 'yjs';
import type { NewObject, YSlide } from './scene';

/** Y.Map key under which each text object's rich-text Y.XmlFragment is stored. */
export const BODY_KEY: 'body';

/**
 * Create a text object together with its body Y.XmlFragment in a single transaction.
 * Use this for ALL text-object creation so peers never split-brain the fragment.
 */
export function createTextObject(slide: YSlide, view: NewObject): string;

/**
 * Lazily create / return the Y.XmlFragment that holds an object's rich text.
 * Seeds from the legacy scalar `text` value once, if present.
 */
export function getTextFragment(objectMap: Y.Map<unknown>): Y.XmlFragment;

/** Derive plain text from the fragment (paragraphs joined by newlines). For thumbnails. */
export function getPlainText(objectMap: Y.Map<unknown> | undefined): string;

export interface RichRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  highlight?: boolean;
  color?: string;
  fontFamily?: string;
  /** CSS size string as READ back, e.g. "40px". */
  fontSize?: string;
  link?: string;
  sub?: boolean;
  sup?: boolean;
}
export interface RichParagraph {
  heading: number;
  /** Paragraph alignment (left|center|right|justify). */
  align?: 'left' | 'center' | 'right' | 'justify';
  /** List membership: 'bullet' (unordered) or 'number' (ordered). Absent for plain paragraphs. */
  list?: 'bullet' | 'number';
  /** Nesting depth within the list (0 = top level). */
  level?: number;
  /** Per-paragraph spacing (imported from .pptx lnSpc/spcBef/spcAft). */
  lineHeight?: number; // unitless line-height multiple (spcPct)
  lineHeightPx?: number; // absolute line box px (spcPts)
  spaceBefore?: number; // margin-top px (spcBef)
  spaceAfter?: number; // margin-bottom px (spcAft)
  runs: RichRun[];
}
/** Rich paragraphs (runs with marks) for styled export. */
export function getRichParagraphs(objectMap: Y.Map<unknown> | undefined): RichParagraph[];

/** Looser run shape accepted by the WRITER: fontSize may be a number (px) or a CSS string;
 * align may be any string (coerced/passed through). */
export interface RichRunInput extends Omit<RichRun, 'fontSize'> {
  fontSize?: string | number;
}
export interface RichParagraphInput {
  heading?: number;
  align?: string;
  /** List membership: 'bullet' | 'number' (or the Tiptap node names 'bulletList'|'orderedList'). */
  list?: 'bullet' | 'number' | 'bulletList' | 'orderedList';
  /** Nesting depth within the list (0 = top level). */
  level?: number;
  runs: RichRunInput[];
}

/**
 * Write styled paragraphs into an object's body Y.XmlFragment (importer counterpart of
 * getRichParagraphs). Builds paragraph/heading nodes whose Y.XmlText runs carry the marks
 * y-prosemirror reads. Replaces any existing body and refreshes the plain-text mirror.
 */
export function setRichParagraphs(
  objectMap: Y.Map<unknown> | undefined,
  paragraphs: RichParagraphInput[],
): void;

/** Replace the whole body with plain text and refresh the legacy scalar mirror. */
export function setPlainText(objectMap: Y.Map<unknown> | undefined, value: string): void;

/** Refresh the legacy scalar `text` mirror from the current fragment contents. */
export function syncPlainTextMirror(objectMap: Y.Map<unknown> | undefined): void;
