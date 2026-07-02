import type * as Y from 'yjs';

export interface DeckTheme {
  name: string;
  palette: string[];
  fontHeading: string;
  fontBody: string;
  bg: string;
}
// Master lite overrides layered over the built-in theme; '' means "no override".
export interface DeckCustomTheme {
  accent: string;
  text: string;
  bg: string;
  bgImage: string;
  fontHeading: string;
  fontBody: string;
}
export type LogoPos = 'tl' | 'tr' | 'bl' | 'br';
export type LogoSize = 's' | 'm';
export interface DeckLogo {
  url: string;
  pos: LogoPos;
  size: LogoSize;
}
export interface DeckFooter {
  text: string;
  showNumber: boolean;
  showDate: boolean;
}
export interface DeckSection {
  id: string;
  title: string;
}
export interface SlideSize {
  w: number;
  h: number;
}

export const DEFAULT_SLIDE: SlideSize;

export function getMeta(doc: Y.Doc): Y.Map<unknown>;
export function getTitle(doc: Y.Doc): string;
export function setTitle(doc: Y.Doc, title: string): void;
export function getSlideSize(doc: Y.Doc): SlideSize;
export function setSlideSize(doc: Y.Doc, w: number, h: number): void;
export function getTheme(doc: Y.Doc): DeckTheme | null;
export function setTheme(doc: Y.Doc, theme: Partial<DeckTheme>): void;
export function applyTheme(doc: Y.Doc, theme: Partial<DeckTheme>): void;
export function getCustomTheme(doc: Y.Doc): DeckCustomTheme;
export function setCustomTheme(doc: Y.Doc, patch: Partial<DeckCustomTheme>): void;
export function applyCustomBackground(doc: Y.Doc, bg: string): void;
export function resetCustomTheme(doc: Y.Doc): void;
export function getDefaultBackground(doc: Y.Doc): string;
export function getLogo(doc: Y.Doc): DeckLogo;
export function setLogo(doc: Y.Doc, patch: Partial<DeckLogo>): void;
export function getFooter(doc: Y.Doc): DeckFooter;
export function setFooter(doc: Y.Doc, patch: Partial<DeckFooter>): void;
export function getSections(doc: Y.Doc): DeckSection[];
export function addSection(doc: Y.Doc, title: string, afterSlideId?: string): string;
export function renameSection(doc: Y.Doc, id: string, title: string): void;
export function deleteSection(doc: Y.Doc, id: string): void;
