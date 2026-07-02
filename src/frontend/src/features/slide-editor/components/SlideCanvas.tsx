import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Moveable from 'react-moveable';
import { useEditorCtx } from '../state/editorContext';
import { setProp, setProps } from '../crdt/scene.js';
import { getFooter } from '../crdt/deck.js';
import { themeVars, MasterBackground, MasterLogo } from '../lib/deckTheme';
import { SNAP_THRESHOLD, slideHorizontalGuidelines, slideVerticalGuidelines } from '../lib/snapping';
import { expandGroups } from '../lib/align';
import type { SlideObjectView as ObjView } from '../crdt/scene';
import { SlideObjectView } from './SlideObjectView';
import { FloatingToolbar } from './FloatingToolbar';
import { ContextMenu } from './ContextMenu';
import { Rulers } from './Rulers';

// The slide stage. Reads everything from the editor context. Renders the slide at its design size
// (deck meta) scaled to fit / to the zoom level, with snapping, multi-select Moveable, the floating
// contextual toolbar, an optional grid overlay, remote cursors and the footer.
export function SlideCanvas() {
  const { t, i18n } = useTranslation();
  const ctx = useEditorCtx();
  const { slide, awareness, objects, selectedIds, slideSize, zoom, fit, showGrid, editingId, readOnly } = ctx;
  const W = slideSize.w;
  const H = slideSize.h;
  const primary: string | null = selectedIds[0] ?? null;

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const [fitScale, setFitScale] = useState(1);
  const [gesture, setGesture] = useState<null | 'move' | 'resize' | 'rotate'>(null);
  const [keepRatio, setKeepRatio] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number; add: boolean } | null>(null);
  // Start geometry captured at resize-start, keyed by object id. Moveable's `width`/`height`
  // (cssWidth) misbehaves for React-controlled sizes, but its `dist`/`direction` are correct, so
  // we derive the new box from start + dist ourselves.
  const resizeStart = useRef<Record<string, { w: number; h: number; x: number; y: number }>>({});
  const [, bump] = useReducer((c: number) => c + 1, 0);

  const scale = fit ? fitScale : zoom;

  // Measure the stage → fit scale.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const pad = 48;
      setFitScale(Math.max(0.1, Math.min((el.clientWidth - pad) / W, (el.clientHeight - pad) / H)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

  // Shift = lock aspect ratio while resizing.
  useEffect(() => {
    const down = (e: KeyboardEvent) => e.key === 'Shift' && setKeepRatio(true);
    const up = (e: KeyboardEvent) => e.key === 'Shift' && setKeepRatio(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Finalize a marquee selection on pointer-up: select objects whose box intersects the rect.
  useEffect(() => {
    if (!marquee) return;
    const up = () => {
      const { x0, y0, x1, y1, add } = marquee;
      if (Math.abs(x1 - x0) > 4 || Math.abs(y1 - y0) > 4) {
        const rx0 = Math.min(x0, x1);
        const ry0 = Math.min(y0, y1);
        const rx1 = Math.max(x0, x1);
        const ry1 = Math.max(y0, y1);
        const hits = objects
          .filter((o) => o.x < rx1 && o.x + o.w > rx0 && o.y < ry1 && o.y + o.h > ry0)
          .map((o) => o.id);
        if (hits.length) ctx.setSelectedIds((prev) => (add ? Array.from(new Set([...prev, ...hits])) : hits));
      }
      setMarquee(null);
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [marquee, objects, ctx]);

  // Re-render on awareness (cursors/selection) changes.
  useEffect(() => {
    if (!awareness) return;
    const fn = () => bump();
    (awareness as { on: (e: string, f: () => void) => void; off: (e: string, f: () => void) => void }).on('change', fn);
    return () => (awareness as { off: (e: string, f: () => void) => void }).off('change', fn);
  }, [awareness]);

  const targets = useMemo(
    () =>
      selectedIds
        .filter((id) => id !== editingId)
        .map((id) => {
          const o = objects.find((x) => x.id === id);
          return o && !o.locked ? refs.current[id] : null;
        })
        .filter((el): el is HTMLElement => !!el),
    [selectedIds, objects, editingId],
  );

  const recomputeAnchor = () => {
    const el = primary ? refs.current[primary] : null;
    if (!el) return setAnchor(null);
    const r = el.getBoundingClientRect();
    setAnchor({ top: r.top, left: r.left, width: r.width, height: r.height });
  };
  useLayoutEffect(recomputeAnchor, [primary, objects, scale, gesture]);
  useEffect(() => {
    const fn = () => recomputeAnchor();
    window.addEventListener('scroll', fn, true);
    window.addEventListener('resize', fn);
    return () => {
      window.removeEventListener('scroll', fn, true);
      window.removeEventListener('resize', fn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary]);

  const elementGuidelines = useMemo(
    () =>
      objects
        .filter((o) => !selectedIds.includes(o.id))
        .map((o) => refs.current[o.id])
        .filter((el): el is HTMLElement => !!el),
    [objects, selectedIds],
  );
  const verticalGuidelines = useMemo(() => slideVerticalGuidelines(W), [W]);
  const horizontalGuidelines = useMemo(() => slideHorizontalGuidelines(H), [H]);

  if (!slide) {
    return (
      <div className="stage" ref={stageRef}>
        <div className="muted">{t('Connexion au document…')}</div>
      </div>
    );
  }

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!canvasRef.current) return;
    if (marquee) {
      const p = toLocal(e);
      setMarquee((m) => (m ? { ...m, x1: p.x, y1: p.y } : m));
    }
    if (awareness) {
      const p = toLocal(e);
      (awareness as { setLocalStateField: (k: string, v: unknown) => void }).setLocalStateField('cursor', p);
    }
  };

  const states: Array<[number, any]> = awareness
    ? Array.from((awareness as { getStates: () => Map<number, any> }).getStates().entries())
    : [];
  const myId: number | undefined = (awareness as { clientID?: number } | null)?.clientID;
  const remoteSelection = new Map<string, string>();
  for (const [cid, st] of states) {
    if (cid === myId) continue;
    if (st?.selection) remoteSelection.set(st.selection, st.user?.color ?? '#888');
  }

  const idFromTarget = (el: HTMLElement): string | null => {
    for (const [id, node] of Object.entries(refs.current)) if (node === el) return id;
    return null;
  };

  const footer = getFooter(slide.doc!);
  const footerText = [
    footer.text,
    footer.showDate ? new Date().toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'fr-FR') : '',
    footer.showNumber ? `${ctx.activeIndex + 1}` : '',
  ]
    .filter(Boolean)
    .join('   ·   ');

  // Capture each selected object's start geometry so resize can be derived from start + dist.
  const beginResize = () => {
    const m: Record<string, { w: number; h: number; x: number; y: number }> = {};
    for (const id of selectedIds) {
      const o = objects.find((x) => x.id === id);
      if (o) m[id] = { w: o.w, h: o.h, x: o.x, y: o.y };
    }
    resizeStart.current = m;
    setGesture('resize');
  };
  // dist = [Δwidth, Δheight] (signed); direction = [-1|0|1, -1|0|1]. Left/top edges shift the origin.
  const applyResize = (id: string | null, dist: number[], direction: number[]) => {
    if (!id) return;
    const st = resizeStart.current[id];
    if (!st) return;
    const patch: { w: number; h: number; x?: number; y?: number } = {
      w: Math.max(8, Math.round(st.w + dist[0])),
      h: Math.max(8, Math.round(st.h + dist[1])),
    };
    if (direction[0] < 0) patch.x = Math.round(st.x - dist[0]);
    if (direction[1] < 0) patch.y = Math.round(st.y - dist[1]);
    setProps(slide, id, patch);
  };

  const selectObject = (id: string, e: React.PointerEvent) => {
    if (e.shiftKey) {
      ctx.setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
      return;
    }
    // Clicking a grouped object selects the whole group.
    const group = expandGroups(slide, [id]);
    if (group.length > 1) ctx.setSelectedIds(group);
    else if (!selectedIds.includes(id)) ctx.setSelected(id);
  };

  return (
    <div className="stage" ref={stageRef}>
      <div className="slide-scaler" style={{ width: W * scale, height: H * scale }}>
        {ctx.showRulers && <Rulers w={W} h={H} scale={scale} />}
        <div
          ref={canvasRef}
          className="slide"
          style={{
            ...themeVars(ctx.doc),
            width: W,
            height: H,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            background: (slide.get('background') as string) || '#ffffff',
          }}
          onPointerMove={onPointerMove}
          onPointerDown={(e) => {
            if (e.target === canvasRef.current) {
              ctx.setEditingId(null);
              if (!e.shiftKey) ctx.setSelectedIds([]);
              const p = toLocal(e);
              setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y, add: e.shiftKey });
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            // Select the object under the cursor (if any) before opening the menu.
            const hit = Object.entries(refs.current).find(([, node]) => node && node.contains(e.target as Node));
            if (hit && !selectedIds.includes(hit[0])) ctx.setSelected(hit[0]);
            else if (!hit) ctx.setSelectedIds([]);
            setMenu({ x: e.clientX, y: e.clientY });
          }}
        >
          <MasterBackground doc={ctx.doc} />

          {showGrid && <div className="slide-grid" />}

          {objects.length === 0 && (
            <div className="slide-empty">
              <span className="material-icons">add_photo_alternate</span>
              <p>{t('Diapositive vide, ajoutez du texte, des formes ou un graphique depuis l’onglet Insertion.')}</p>
            </div>
          )}

          {marquee && (
            <div
              className="slide-marquee"
              style={{
                left: Math.min(marquee.x0, marquee.x1),
                top: Math.min(marquee.y0, marquee.y1),
                width: Math.abs(marquee.x1 - marquee.x0),
                height: Math.abs(marquee.y1 - marquee.y0),
              }}
            />
          )}

          {objects.map((o: ObjView) => (
            <SlideObjectView
              key={o.id}
              ref={(el) => {
                refs.current[o.id] = el;
              }}
              slide={slide}
              o={o}
              selected={selectedIds.includes(o.id)}
              editing={o.id === editingId}
              remoteColor={remoteSelection.get(o.id)}
              onSelect={(e) => selectObject(o.id, e)}
              onStartEdit={() => {
                ctx.setSelected(o.id);
                if (!readOnly) ctx.setEditingId(o.id);
              }}
            />
          ))}

          {states.map(([cid, st]) =>
            cid !== myId && st?.cursor ? (
              <div key={cid} className="cursor" style={{ left: st.cursor.x, top: st.cursor.y }}>
                <span className="dot" style={{ background: st.user?.color }} />
                <span className="label" style={{ background: st.user?.color }}>
                  {st.user?.name}
                </span>
              </div>
            ) : null,
          )}

          {footerText && <div className="slide-footer">{footerText}</div>}
          <MasterLogo doc={ctx.doc} />

          {gesture &&
            primary &&
            (() => {
              const s = objects.find((o) => o.id === primary);
              if (!s) return null;
              const label =
                gesture === 'resize'
                  ? `${Math.round(s.w)} × ${Math.round(s.h)}`
                  : gesture === 'rotate'
                    ? `${Math.round(s.rotation || 0)}°`
                    : `${Math.round(s.x)}, ${Math.round(s.y)}`;
              return (
                <div className="dim-badge" style={{ left: s.x, top: Math.max(2, s.y - 26) }}>
                  {label}
                </div>
              );
            })()}
        </div>

        {targets.length > 0 && ctx.overlay !== 'present' && !readOnly && (
          <Moveable
            target={targets.length === 1 ? targets[0] : targets}
            draggable
            resizable
            rotatable
            keepRatio={keepRatio}
            renderDirections={['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']}
            throttleDrag={0}
            throttleResize={0}
            throttleRotate={0}
            snappable
            snapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
            elementSnapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
            snapThreshold={SNAP_THRESHOLD}
            snapRenderThreshold={1}
            isDisplaySnapDigit
            elementGuidelines={elementGuidelines}
            verticalGuidelines={verticalGuidelines}
            horizontalGuidelines={horizontalGuidelines}
            onDragStart={() => setGesture('move')}
            onDrag={({ target, left, top }) => {
              const id = idFromTarget(target as HTMLElement);
              if (id) setProps(slide, id, { x: Math.round(left), y: Math.round(top) });
            }}
            onDragEnd={() => setGesture(null)}
            onDragGroupStart={() => setGesture('move')}
            onDragGroup={({ events }) =>
              events.forEach((ev) => {
                const id = idFromTarget(ev.target as HTMLElement);
                if (id) setProps(slide, id, { x: Math.round(ev.left), y: Math.round(ev.top) });
              })
            }
            onDragGroupEnd={() => setGesture(null)}
            onResizeStart={beginResize}
            onResize={({ target, dist, direction }) => applyResize(idFromTarget(target as HTMLElement), dist, direction)}
            onResizeEnd={() => setGesture(null)}
            onResizeGroupStart={beginResize}
            onResizeGroup={({ events }) => events.forEach((ev) => applyResize(idFromTarget(ev.target as HTMLElement), ev.dist, ev.direction))}
            onResizeGroupEnd={() => setGesture(null)}
            onRotateStart={() => setGesture('rotate')}
            onRotate={({ target, rotation }) => {
              const id = idFromTarget(target as HTMLElement);
              if (id) setProp(slide, id, 'rotation', Math.round(rotation));
            }}
            onRotateEnd={() => setGesture(null)}
          />
        )}
      </div>

      {!readOnly && <FloatingToolbar anchor={anchor} />}
      {menu && <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </div>
  );
}
