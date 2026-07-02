import { useEffect, useMemo, useReducer, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type * as Y from 'yjs';
import { getSlides, getSlideAt, getNotes, getTransition } from '../crdt/slides.js';
import { listObjects, effectiveAnims } from '../crdt/scene.js';
import type { Anim, SlideObjectView as ObjView, YSlide } from '../crdt/scene';
import { SlideStatic } from './SlideStatic';
import './Presenter.css';

// One fired animation in a slide's build sequence.
interface StepItem {
  obj: ObjView;
  anim: Anim;
}

// Flatten every object's animation list into click steps. Items are sorted by (order, z-index,
// list position); a 'with'/'after' trigger joins the previous step so it fires on the same click
// ('after' still applies its own delay). Everything else ('click' or unset) starts a new step.
function buildSteps(objects: ObjView[]): StepItem[][] {
  const items: { obj: ObjView; anim: Anim; order: number; z: number; seq: number }[] = [];
  objects.forEach((obj, z) => {
    effectiveAnims(obj).forEach((anim, seq) => items.push({ obj, anim, order: anim.order ?? 0, z, seq }));
  });
  items.sort((a, b) => a.order - b.order || a.z - b.z || a.seq - b.seq);
  const steps: StepItem[][] = [];
  for (const it of items) {
    const joins = (it.anim.trigger === 'with' || it.anim.trigger === 'after') && steps.length > 0;
    if (joins) steps[steps.length - 1].push({ obj: it.obj, anim: it.anim });
    else steps.push([{ obj: it.obj, anim: it.anim }]);
  }
  return steps;
}

// Fullscreen slideshow + true presenter (speaker) view. Renders read-only via SlideStatic, plays
// per-object animation builds (entrance/emphasis/exit, one step per click) and per-slide
// transitions, and broadcasts the current slide over awareness so peers can follow. Keys: →/Space
// next (or fire the next animation step), ← prev, P presenter view, N notes, F/Home/End, Esc exit.
export function Presenter({
  doc,
  startIndex,
  awareness,
  onExit,
}: {
  doc: Y.Doc;
  startIndex: number;
  awareness?: unknown;
  onExit: () => void;
}) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(startIndex);
  const [step, setStep] = useState(0);
  const [speaker, setSpeaker] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280);
  const [vh, setVh] = useState(typeof window !== 'undefined' ? window.innerHeight : 720);
  const [, bump] = useReducer((c: number) => c + 1, 0);

  useEffect(() => {
    const slides = getSlides(doc);
    const fn = () => bump();
    slides.observeDeep(fn);
    return () => slides.unobserveDeep(fn);
  }, [doc]);

  const count = getSlides(doc).length;
  const idx = Math.max(0, Math.min(index, count - 1));
  const slide = getSlideAt(doc, idx) as YSlide | null;
  const nextSlide = idx + 1 < count ? (getSlideAt(doc, idx + 1) as YSlide | null) : null;

  const steps = useMemo<StepItem[][]>(
    () => (slide ? buildSteps(listObjects(slide)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slide, idx],
  );

  // Per-object animation state for the current step count: which objects still await their
  // entrance (hidden), which have exited (hidden once the exit finished), and the last fired
  // anim per object (drives the CSS class/duration of the just-clicked step).
  const animView = useMemo(() => {
    const hasEntrance = new Set<string>();
    for (const grp of steps) for (const it of grp) if ((it.anim.kind ?? 'entrance') === 'entrance') hasEntrance.add(it.obj.id);
    const state = new Map<string, 'shown' | 'exited'>();
    const fired = new Map<string, { stepNo: number; anim: Anim }>();
    steps.slice(0, step).forEach((grp, i) => {
      for (const it of grp) {
        fired.set(it.obj.id, { stepNo: i + 1, anim: it.anim });
        const kind = it.anim.kind ?? 'entrance';
        if (kind === 'entrance') state.set(it.obj.id, 'shown');
        else if (kind === 'exit') state.set(it.obj.id, 'exited');
      }
    });
    return { hasEntrance, state, fired };
  }, [steps, step]);

  // Broadcast presenter position so peers can follow.
  useEffect(() => {
    const aw = awareness as { setLocalStateField?: (k: string, v: unknown) => void } | null;
    aw?.setLocalStateField?.('presenting', idx);
    return () => aw?.setLocalStateField?.('presenting', null);
  }, [awareness, idx]);

  const advance = () => {
    if (step < steps.length) setStep((s) => s + 1);
    else if (idx < count - 1) {
      setIndex(idx + 1);
      setStep(0);
    }
  };
  const back = () => {
    if (step > 0) setStep((s) => s - 1);
    else if (idx > 0) {
      // Land on the previous slide fully built (entrances shown, exits hidden).
      const prev = getSlideAt(doc, idx - 1) as YSlide | null;
      const prevSteps = prev ? buildSteps(listObjects(prev)).length : 0;
      setIndex(idx - 1);
      setStep(prevSteps);
    }
  };

  useEffect(() => {
    const onResize = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => {
      window.removeEventListener('resize', onResize);
      clearInterval(t);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', ' ', 'PageDown', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        advance();
      } else if (['ArrowLeft', 'PageUp', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        back();
      } else if (e.key === 'Escape') onExit();
      else if (e.key === 'Home') {
        setIndex(0);
        setStep(0);
      } else if (e.key === 'End') {
        setIndex(count - 1);
        setStep(0);
      } else if (e.key === 'n' || e.key === 'N') setShowNotes((v) => !v);
      else if (e.key === 'p' || e.key === 'P') setSpeaker((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, step, count, steps.length]);

  if (!slide) return null;

  const trans = getTransition(slide);
  const isVisible = (o: ObjView) => {
    const st = animView.state.get(o.id);
    // Keep an exiting object mounted while its exit plays (the just-fired step); the animation's
    // fill-mode holds the hidden end state, later steps unmount it for the rest of the slide.
    if (st === 'exited') return animView.fired.get(o.id)?.stepNo === step;
    if (st === 'shown') return true;
    return !animView.hasEntrance.has(o.id); // pending entrance starts hidden
  };
  // Class/style only for the just-fired step; afterwards the object sits in its natural state
  // (entrance keyframes animate from a hidden start, so removing the class is a no-op).
  const animClass = (o: ObjView) => {
    const f = animView.fired.get(o.id);
    return f && f.stepNo === step ? `present-anim present-anim-${f.anim.type}` : undefined;
  };
  const animStyle = (o: ObjView): CSSProperties | undefined => {
    const f = animView.fired.get(o.id);
    if (!f || f.stepNo !== step) return undefined;
    return {
      animationDuration: `${f.anim.duration ?? 500}ms`,
      animationDelay: f.anim.delay ? `${f.anim.delay}ms` : undefined,
      // The anim wrapper spans the slide, so scale/shake effects need the object's own centre.
      transformOrigin: `${o.x + o.w / 2}px ${o.y + o.h / 2}px`,
    };
  };
  // Remount the wrapper whenever a new anim fires for the object so the CSS animation restarts
  // even when consecutive steps reuse the same effect.
  const animKey = (o: ObjView) => `${o.id}:${animView.fired.get(o.id)?.stepNo ?? 0}`;

  const stageW = speaker ? Math.min(vw * 0.62, (vh - 120) * (16 / 9)) : Math.min(vw, vh * (16 / 9));
  const notes = getNotes(slide);

  const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const secs = String(elapsed % 60).padStart(2, '0');

  return (
    <div className={`presenter${speaker ? ' is-speaker' : ''}`} onClick={advance}>
      <div className="presenter-main">
        <div key={`${idx}-${trans.type}`} className={`presenter-stage present-trans-${trans.type}`}>
          <SlideStatic slide={slide} width={stageW} slideNumber={idx + 1} isVisible={isVisible} animClass={animClass} animStyle={animStyle} animKey={animKey} />
        </div>
      </div>

      {speaker && (
        <aside className="presenter-aside" onClick={(e) => e.stopPropagation()}>
          <div className="presenter-timer">
            <span className="material-icons">schedule</span> {mins}:{secs}
          </div>
          <div className="presenter-next-label">{t('Suivant')}</div>
          <div className="presenter-next">
            {nextSlide ? <SlideStatic slide={nextSlide} width={Math.min(vw * 0.3, 360)} slideNumber={idx + 2} /> : <div className="presenter-end">{t('Fin')}</div>}
          </div>
          <div className="presenter-notes-label">{t('Notes')}</div>
          <div className="presenter-speaker-notes">{notes || <span className="muted">{t('Aucune note')}</span>}</div>
        </aside>
      )}

      {!speaker && showNotes && notes && (
        <div className="presenter__notes" onClick={(e) => e.stopPropagation()}>
          {notes}
        </div>
      )}

      <div className="presenter__hud" onClick={(e) => e.stopPropagation()}>
        <button onClick={back} disabled={idx <= 0 && step <= 0} aria-label={t('Précédent')}>‹</button>
        <span className="presenter__count">{idx + 1} / {count}</span>
        <button onClick={advance} disabled={idx >= count - 1 && step >= steps.length} aria-label={t('Suivant')}>›</button>
        <button onClick={() => setSpeaker((v) => !v)} className={speaker ? 'is-on' : ''} title={t('Mode présentateur (P)')}>⧉</button>
        <button onClick={() => setShowNotes((v) => !v)} className={showNotes ? 'is-on' : ''} title={t('Notes (N)')}>☰</button>
        <button onClick={onExit} title={t('Quitter (Échap)')}>✕</button>
      </div>
    </div>
  );
}
