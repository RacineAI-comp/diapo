import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCollab } from '../net/useCollab';
import { useDeck } from '../hooks/useDeck';
import { useKeyboard } from '../hooks/useKeyboard';
import { EditorProvider, useEditorCtx } from '../state/editorContext';
import { setDocReadOnly } from '../crdt/guard.js';
import { getPresentation } from '../../dashboard/api';
import { Icon } from './ui/Icon';
import { TopBar } from './TopBar';
import { Ribbon } from './Ribbon';
import { SlidePanel } from './SlidePanel';
import { OutlineView } from './OutlineView';
import { SlideCanvas } from './SlideCanvas';
import { Inspector } from './Inspector';
import { StatusBar } from './StatusBar';
import { NotesBar } from './NotesBar';
import { FollowBanner } from './FollowBanner';
import { Presenter } from './Presenter';
import { ShareDialog } from './ShareDialog';
import { CommentsPanel } from './overlays/CommentsPanel';
import { VersionHistory } from './overlays/VersionHistory';
import { FindReplace } from './overlays/FindReplace';
import { AccessibilityChecker } from './overlays/AccessibilityChecker';
import { ShortcutsOverlay } from './overlays/ShortcutsOverlay';
import { CommandPalette } from './overlays/CommandPalette';
import { ImportDialog } from './overlays/ImportDialog';

function roomFromUrl(): string {
  return docIdFromUrl() || 'slides-demo';
}

// The backend presentation UUID, or null in local demo mode (no ?doc → no API, always editable).
function docIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('doc');
}

export function Editor() {
  const room = roomFromUrl();
  const { provider, doc, awareness, status } = useCollab(room);
  const [activeIndex, setActiveIndex] = useState(0);
  const { activeSlide, count, activeIndex: clamped } = useDeck(provider, activeIndex);

  // Ask the backend what we may do with this deck. abilities.update=false → read-only session.
  // Demo mode / unreachable API stays editable, matching today's behaviour.
  const [readOnly, setReadOnly] = useState(false);
  useEffect(() => {
    const id = docIdFromUrl();
    if (!id) return;
    let cancelled = false;
    getPresentation(id)
      .then((p) => {
        if (!cancelled) setReadOnly(p.abilities?.update === false);
      })
      .catch(() => {
        if (!cancelled) setReadOnly(false);
      });
    return () => {
      cancelled = true;
    };
  }, [room]);

  // CRDT-boundary chokepoint: a read-only doc turns every mutator in crdt/*.js into a no-op, so
  // surfaces not individually wired (inspector, outline, notes, find/replace…) cannot diverge
  // from the server, which drops read-only writes anyway.
  useEffect(() => {
    setDocReadOnly(doc, readOnly);
  }, [doc, readOnly]);

  return (
    <EditorProvider
      doc={doc}
      provider={provider}
      awareness={awareness}
      status={status}
      readOnly={readOnly}
      slide={activeSlide}
      activeIndex={clamped}
      setActiveIndex={setActiveIndex}
      count={count}
    >
      <EditorShell room={room} />
    </EditorProvider>
  );
}

function EditorShell({ room }: { room: string }) {
  const { t } = useTranslation();
  const ctx = useEditorCtx();

  useKeyboard({
    readOnly: ctx.readOnly,
    slide: ctx.slide,
    selectedIds: ctx.selectedIds,
    setSelected: ctx.setSelected,
    setSelectedIds: ctx.setSelectedIds,
    setEditingId: ctx.setEditingId,
    editingId: ctx.editingId,
    undo: ctx.undo.undo,
    redo: ctx.undo.redo,
    openFind: () => ctx.setOverlay('find'),
    openPalette: () => ctx.setOverlay('palette'),
    openShortcuts: () => ctx.setOverlay('shortcuts'),
  });

  const close = () => ctx.setOverlay(null);

  return (
    <div className={`app${ctx.dark ? ' dark' : ''}${ctx.inspectorOpen ? ' inspector-open' : ''}`}>
      <TopBar />
      {ctx.readOnly && (
        <div className="readonly-banner" role="status">
          <Icon name="visibility" />
          <span>
            <strong>{t('Lecture seule')}</strong>{' '}
            {t('Vous pouvez consulter, présenter et exporter cette présentation, mais pas la modifier.')}
          </span>
        </div>
      )}
      <Ribbon />

      <div className="workspace">
        {ctx.showOutline ? (
          <OutlineView />
        ) : (
          <SlidePanel provider={ctx.provider} activeIndex={ctx.activeIndex} setActiveIndex={ctx.setActiveIndex} />
        )}
        <SlideCanvas />
        {/* Compact layouts turn the side panel into a drawer; the backdrop closes it. */}
        <div className="drawer-backdrop" onClick={() => ctx.setInspectorOpen(false)} />
        {ctx.overlay === 'comments' ? <CommentsPanel /> : <Inspector />}
      </div>

      {ctx.showNotes && <NotesBar slide={ctx.slide} />}
      <StatusBar />
      <FollowBanner />

      {ctx.overlay === 'present' && <Presenter doc={ctx.doc} startIndex={ctx.activeIndex} awareness={ctx.awareness} onExit={close} />}
      <ShareDialog id={room} open={ctx.overlay === 'share'} onClose={close} />
      {ctx.overlay === 'versions' && <VersionHistory onClose={close} />}
      {ctx.overlay === 'find' && <FindReplace onClose={close} />}
      {ctx.overlay === 'a11y' && <AccessibilityChecker onClose={close} />}
      {ctx.overlay === 'shortcuts' && <ShortcutsOverlay onClose={close} />}
      {ctx.overlay === 'palette' && <CommandPalette onClose={close} />}
      {ctx.overlay === 'import' && <ImportDialog onClose={close} />}
    </div>
  );
}
