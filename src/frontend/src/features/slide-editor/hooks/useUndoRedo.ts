import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { YSlide } from '../crdt/scene';

// Real Yjs UndoManager scoped to the whole DECK (cross-slide undo).
//
// We track the `slides` array (and its descendants: every slide's objects/zorder/props) plus the
// deck `meta`, so add/delete/move/reorder, prop changes AND edits on other slides are all undoable
// in one history. Only LOCAL edits are tracked: scene.js mutates without an explicit transaction
// origin, so local changes land with origin `null`, while Hocuspocus applies remote updates with
// the provider as origin, tracking `null` isolates "my" edits from peers'.
//
// `canUndo`/`canRedo` stay reactive by subscribing to the manager's stack events.
export interface UndoControls {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useUndoRedo(slide: YSlide | null, _provider: HocuspocusProvider): UndoControls {
  const doc = slide?.doc ?? null;
  const manager = useMemo(() => {
    if (!doc) return null;
    const slides = doc.getArray('slides');
    const meta = doc.getMap('meta');
    return new Y.UndoManager([slides, meta], {
      trackedOrigins: new Set([null]),
      // Coalesce rapid edits (e.g. a drag stream of setProp calls) into one undo step.
      captureTimeout: 300,
    });
  }, [doc]);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    if (!manager) {
      setCanUndo(false);
      setCanRedo(false);
      return;
    }
    const refresh = () => {
      setCanUndo(manager.canUndo());
      setCanRedo(manager.canRedo());
    };
    refresh();
    manager.on('stack-item-added', refresh);
    manager.on('stack-item-popped', refresh);
    manager.on('stack-cleared', refresh);
    return () => {
      manager.off('stack-item-added', refresh);
      manager.off('stack-item-popped', refresh);
      manager.off('stack-cleared', refresh);
      manager.destroy();
    };
  }, [manager]);

  return useMemo(
    () => ({
      undo: () => manager?.undo(),
      redo: () => manager?.redo(),
      canUndo,
      canRedo,
    }),
    [manager, canUndo, canRedo],
  );
}
