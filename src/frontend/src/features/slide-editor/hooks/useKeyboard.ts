import { useEffect, useRef } from 'react';
import { deleteObject, listObjects, setProp } from '../crdt/scene.js';
import { duplicateObject, insertFromView } from '../lib/insert';
import type { NewObject } from '../crdt/scene';
import type { SlideObjectView, YSlide } from '../crdt/scene';

// Global keyboard shortcuts for the editor:
//   Delete / Backspace       -> delete selection
//   Cmd/Ctrl+Z / +Shift+Z    -> undo / redo (Ctrl+Y also redoes)
//   Cmd/Ctrl+D               -> duplicate selection
//   Cmd/Ctrl+C / +V          -> copy / paste via an in-memory clipboard
//   Cmd/Ctrl+A               -> select all on the slide
//   Cmd/Ctrl+F               -> find & replace
//   Cmd/Ctrl+K               -> command palette
//   ?                        -> shortcuts overlay
//   Arrows                   -> nudge (Shift = 10px)
//   Escape                   -> exit edit / deselect
// Ignored while typing in an input/textarea/contenteditable.
// readOnly keeps navigation/overlay shortcuts (find, palette, copy, select all) but drops every
// mutating one (delete, paste, duplicate, undo/redo, nudge).
export interface KeyboardCtx {
  readOnly: boolean;
  slide: YSlide | null;
  selectedIds: string[];
  setSelected: (id: string | null) => void;
  setSelectedIds: (updater: string[] | ((p: string[]) => string[])) => void;
  setEditingId: (id: string | null) => void;
  editingId: string | null;
  undo: () => void;
  redo: () => void;
  openFind: () => void;
  openPalette: () => void;
  openShortcuts: () => void;
}

type Clip = Omit<SlideObjectView, 'id'>[];

function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

export function useKeyboard(ctx: KeyboardCtx): void {
  const ref = useRef(ctx);
  ref.current = ctx;
  const clipboard = useRef<Clip>([]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const { readOnly, slide, selectedIds, setSelected, setSelectedIds, setEditingId, editingId, undo, redo, openFind, openPalette, openShortcuts } = ref.current;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key;

      // Escape works even while editing (to leave the text box).
      if (key === 'Escape') {
        if (editingId) setEditingId(null);
        else setSelected(null);
        return;
      }
      if (isEditableTarget(e.target)) return;

      if (mod && (key === 'z' || key === 'Z')) {
        if (readOnly) return;
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (mod && (key === 'y' || key === 'Y')) {
        if (readOnly) return;
        e.preventDefault();
        redo();
        return;
      }
      if (mod && (key === 'f' || key === 'F')) {
        e.preventDefault();
        openFind();
        return;
      }
      if (mod && (key === 'k' || key === 'K')) {
        e.preventDefault();
        openPalette();
        return;
      }
      if (!mod && key === '?') {
        e.preventDefault();
        openShortcuts();
        return;
      }
      if (!slide) return;

      if (mod && (key === 'a' || key === 'A')) {
        e.preventDefault();
        setSelectedIds(listObjects(slide).map((o) => o.id));
        return;
      }
      if (mod && (key === 'c' || key === 'C')) {
        if (selectedIds.length) {
          const objs = listObjects(slide);
          clipboard.current = selectedIds.map((id) => objs.find((o) => o.id === id)).filter(Boolean).map((o) => {
            const { id: _d, ...rest } = o as SlideObjectView;
            return rest;
          });
          e.preventDefault();
        }
        return;
      }
      if (mod && (key === 'v' || key === 'V')) {
        if (clipboard.current.length && !readOnly) {
          e.preventDefault();
          const ids = clipboard.current
            .map((snap) => insertFromView(slide, { ...snap, x: snap.x + 16, y: snap.y + 16 } as NewObject))
            .filter(Boolean);
          if (ids.length) setSelectedIds(ids);
        }
        return;
      }
      if (mod && (key === 'd' || key === 'D')) {
        if (selectedIds.length && !readOnly) {
          e.preventDefault();
          const ids = selectedIds.map((id) => duplicateObject(slide, id)).filter((x): x is string => !!x);
          if (ids.length) setSelectedIds(ids);
        }
        return;
      }

      if (!selectedIds.length || readOnly) return;

      if (key === 'Delete' || key === 'Backspace') {
        e.preventDefault();
        selectedIds.forEach((id) => deleteObject(slide, id));
        setSelected(null);
        return;
      }

      const step = e.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;
      if (key === 'ArrowLeft') dx = -step;
      else if (key === 'ArrowRight') dx = step;
      else if (key === 'ArrowUp') dy = -step;
      else if (key === 'ArrowDown') dy = step;
      else return;
      e.preventDefault();
      const objs = listObjects(slide);
      selectedIds.forEach((id) => {
        const cur = objs.find((o) => o.id === id);
        if (!cur) return;
        if (dx) setProp(slide, id, 'x', cur.x + dx);
        if (dy) setProp(slide, id, 'y', cur.y + dy);
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
