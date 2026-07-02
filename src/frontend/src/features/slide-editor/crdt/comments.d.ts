import type * as Y from 'yjs';

export interface CommentItem {
  id: string;
  author: string;
  color: string;
  text: string;
  ts: number;
}
export interface CommentThread {
  id: string;
  slideId: string;
  objectId: string | null;
  resolved: boolean;
  createdAt: number;
  items: CommentItem[];
}

export function getComments(doc: Y.Doc): Y.Map<unknown>;
export function addThread(
  doc: Y.Doc,
  input: { slideId: string; objectId?: string | null; author: string; color: string; text: string },
): string;
export function addReply(
  doc: Y.Doc,
  threadId: string,
  input: { author: string; color: string; text: string },
): void;
export function setResolved(doc: Y.Doc, threadId: string, resolved: boolean): void;
export function deleteThread(doc: Y.Doc, threadId: string): void;
export function listThreads(doc: Y.Doc, opts?: { slideId?: string }): CommentThread[];
export function parseMentions(text: string): string[];
