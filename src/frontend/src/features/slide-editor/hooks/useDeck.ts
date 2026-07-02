import { useEffect, useReducer } from 'react';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { ensureFirstSlide, getSlides, getSlideAt } from '../crdt/slides.js';
import type { YSlide } from '../crdt/scene';

// Manages the deck and resolves the active slide reactively.
// Foundation behaviour: creates slide[0] after sync, returns the active slide by index.
export interface Deck {
  count: number;
  activeIndex: number;
  activeSlide: YSlide | null;
}

export function useDeck(provider: HocuspocusProvider, activeIndex: number): Deck {
  const [, force] = useReducer((c: number) => c + 1, 0);
  const doc = provider.document;

  useEffect(() => {
    const slides = getSlides(doc);
    const refresh = () => force();
    const onSynced = () => {
      ensureFirstSlide(doc);
      force();
    };
    slides.observe(refresh);
    provider.on('synced', onSynced);
    if (provider.synced) onSynced();
    return () => {
      slides.unobserve(refresh);
      provider.off('synced', onSynced);
    };
  }, [provider, doc]);

  const count = getSlides(doc).length;
  const idx = Math.max(0, Math.min(activeIndex, count - 1));
  return { count, activeIndex: idx, activeSlide: count > 0 ? getSlideAt(doc, idx) : null };
}
