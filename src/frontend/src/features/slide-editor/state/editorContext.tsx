import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type * as Y from 'yjs';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { listObjects } from '../crdt/scene.js';
import { getTitle, getTheme, getSlideSize, getFooter, getSections } from '../crdt/deck.js';
import type { Editor as TiptapEditor } from '@tiptap/react';
import type { SlideObjectView, YSlide } from '../crdt/scene';
import type { DeckFooter, DeckSection, DeckTheme, SlideSize } from '../crdt/deck';
import { useUndoRedo, type UndoControls } from '../hooks/useUndoRedo';

export type RibbonTab = 'home' | 'insert' | 'design' | 'transitions' | 'animations' | 'view';
export type InspectorTab = 'format' | 'arrange' | 'design' | 'animations';
export type Overlay =
  | null
  | 'present'
  | 'share'
  | 'comments'
  | 'versions'
  | 'palette'
  | 'find'
  | 'a11y'
  | 'shortcuts'
  | 'import';

interface EditorState {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  awareness: unknown;
  status: string;
  // True when the backend says abilities.update is false: the whole editor is view-only.
  readOnly: boolean;
  // deck / slide
  slide: YSlide | null;
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  count: number;
  // scene (reactive)
  objects: SlideObjectView[];
  // selection
  selectedIds: string[];
  setSelectedIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  selected: string | null; // primary
  setSelected: (id: string | null) => void;
  selectedObj: SlideObjectView | null;
  // deck meta (reactive)
  title: string;
  theme: DeckTheme | null;
  slideSize: SlideSize;
  footer: DeckFooter;
  sections: DeckSection[];
  // undo
  undo: UndoControls;
  // ui state
  ribbonTab: RibbonTab;
  setRibbonTab: (t: RibbonTab) => void;
  inspectorTab: InspectorTab;
  setInspectorTab: (t: InspectorTab) => void;
  zoom: number; // 1 = fit
  setZoom: (z: number) => void;
  fit: boolean;
  setFit: (b: boolean) => void;
  showGrid: boolean;
  setShowGrid: (b: boolean) => void;
  showNotes: boolean;
  setShowNotes: (b: boolean) => void;
  // Compact layouts collapse the inspector into an off-canvas drawer (see the media queries);
  // this holds whether the drawer is open. Desktop ignores it.
  inspectorOpen: boolean;
  setInspectorOpen: (b: boolean) => void;
  dark: boolean;
  setDark: (b: boolean) => void;
  showOutline: boolean;
  setShowOutline: (b: boolean) => void;
  showRulers: boolean;
  setShowRulers: (b: boolean) => void;
  overlay: Overlay;
  setOverlay: (o: Overlay) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  // The Tiptap editor of the text box currently being edited (null otherwise), lets the ribbon,
  // inspector and floating toolbar all drive per-run text formatting on the same instance.
  activeEditor: TiptapEditor | null;
  setActiveEditor: Dispatch<SetStateAction<TiptapEditor | null>>;
  // Last export failure (user-facing, already translated), shown by the TopBar alert.
  exportError: string | null;
  setExportError: (m: string | null) => void;
}

const Ctx = createContext<EditorState | null>(null);

export function useEditorCtx(): EditorState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useEditorCtx must be used within EditorProvider');
  return v;
}

interface ProviderProps {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  awareness: unknown;
  status: string;
  readOnly: boolean;
  slide: YSlide | null;
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  count: number;
  children: ReactNode;
}

export function EditorProvider(props: ProviderProps) {
  const { doc, provider, awareness, status, readOnly, slide, activeIndex, setActiveIndex, count } = props;
  const [, force] = useReducer((c: number) => c + 1, 0);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [ribbonTab, setRibbonTab] = useState<RibbonTab>('home');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('format');
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [dark, setDarkState] = useState(() => {
    try {
      return localStorage.getItem('slides.dark') === '1';
    } catch {
      return false;
    }
  });
  const setDark = (b: boolean) => {
    setDarkState(b);
    try {
      localStorage.setItem('slides.dark', b ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  const [showOutline, setShowOutline] = useState(false);
  const [showRulers, setShowRulers] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeEditor, setActiveEditor] = useState<TiptapEditor | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Reactive scene snapshot, single subscription shared by canvas, inspector, toolbar, status.
  useEffect(() => {
    if (!slide) return;
    const fn = () => force();
    slide.observeDeep(fn);
    return () => slide.unobserveDeep(fn);
  }, [slide]);
  const objects = slide ? listObjects(slide) : [];

  // Reactive deck meta.
  useEffect(() => {
    const meta = doc.getMap('meta');
    const fn = () => force();
    meta.observeDeep(fn);
    return () => meta.unobserveDeep(fn);
  }, [doc]);
  const title = getTitle(doc);
  const theme = getTheme(doc);
  const slideSize = getSlideSize(doc);
  const footer = getFooter(doc);
  const sections = getSections(doc);

  const undo = useUndoRedo(slide, provider);

  const selected = selectedIds[0] ?? null;

  // Broadcast the primary selection over awareness so peers can show who has what selected.
  useEffect(() => {
    (awareness as { setLocalStateField?: (k: string, v: unknown) => void } | null)?.setLocalStateField?.('selection', selected);
  }, [awareness, selected]);
  const setSelected = (id: string | null) => setSelectedIds(id ? [id] : []);
  const selectedObj = useMemo(
    () => (selected ? objects.find((o) => o.id === selected) ?? null : null),
    [selected, objects],
  );

  // Drop selections that no longer exist (deleted by us or a peer).
  useEffect(() => {
    if (!selectedIds.length) return;
    const present = new Set(objects.map((o) => o.id));
    const next = selectedIds.filter((id) => present.has(id));
    if (next.length !== selectedIds.length) setSelectedIds(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objects]);

  const value: EditorState = {
    doc,
    provider,
    awareness,
    status,
    readOnly,
    slide,
    activeIndex,
    setActiveIndex,
    count,
    objects,
    selectedIds,
    setSelectedIds,
    selected,
    setSelected,
    selectedObj,
    title,
    theme,
    slideSize,
    footer,
    sections,
    undo,
    ribbonTab,
    setRibbonTab,
    inspectorTab,
    setInspectorTab,
    zoom,
    setZoom,
    fit,
    setFit,
    showGrid,
    setShowGrid,
    showNotes,
    setShowNotes,
    inspectorOpen,
    setInspectorOpen,
    dark,
    setDark,
    showOutline,
    setShowOutline,
    showRulers,
    setShowRulers,
    overlay,
    setOverlay,
    editingId,
    setEditingId,
    activeEditor,
    setActiveEditor,
    exportError,
    setExportError,
  };

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}
