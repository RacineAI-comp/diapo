import type * as Y from 'yjs';
import type { YSlide } from './scene';

export function getSlides(doc: Y.Doc): Y.Array<YSlide>;
export function newSlide(doc?: Y.Doc): YSlide;
export function ensureFirstSlide(doc: Y.Doc): Y.Array<YSlide>;
export function getSlideAt(doc: Y.Doc, index?: number): YSlide | null;
export function getNotes(slide: YSlide | null): string;
export function setNotes(slide: YSlide | null, text: string): void;
export interface SlideTransition {
  type: string;
  duration: number;
}
export function getTransition(slide: YSlide | null): SlideTransition;
export function setTransition(slide: YSlide | null, transition: SlideTransition): void;
export function getLayout(slide: YSlide | null): string;
export function setLayout(slide: YSlide | null, layoutId: string): void;
export function getSection(slide: YSlide | null): string | null;
export function setSection(slide: YSlide | null, sectionId: string | null): void;
export function listSlideIds(doc: Y.Doc): string[];
export function addSlide(doc: Y.Doc, atIndex?: number): number;
export function deleteSlide(doc: Y.Doc, index: number): void;
export function moveSlide(doc: Y.Doc, from: number, to: number): void;
export function duplicateSlide(doc: Y.Doc, index: number): number;
export function replaceSlides(doc: Y.Doc, slidesJson: unknown[], opts?: { reid?: boolean }): void;
export function appendSlides(doc: Y.Doc, slidesJson: unknown[], opts?: { reid?: boolean }): void;
