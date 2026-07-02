import type * as Y from 'yjs';

export interface VersionMeta {
  id: string;
  label: string;
  author: string;
  ts: number;
}

export function getVersions(doc: Y.Doc): Y.Array<unknown>;
export function captureVersion(doc: Y.Doc, label: string, author?: string): string;
export function listVersions(doc: Y.Doc): VersionMeta[];
export function restoreVersion(doc: Y.Doc, id: string): boolean;
export function deleteVersion(doc: Y.Doc, id: string): void;
