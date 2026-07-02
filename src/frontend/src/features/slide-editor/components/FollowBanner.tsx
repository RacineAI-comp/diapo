import { useEffect, useReducer, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorCtx } from '../state/editorContext';
import { Icon } from './ui/Icon';
import './FollowBanner.css';

// Shows when a peer is presenting (broadcasts a `presenting` slide index over awareness). "Suivre"
// keeps the local editor view on the presenter's current slide live.
export function FollowBanner() {
  const { t } = useTranslation();
  const ctx = useEditorCtx();
  const aw = ctx.awareness as {
    on?: (e: string, f: () => void) => void;
    off?: (e: string, f: () => void) => void;
    getStates?: () => Map<number, { user?: { name?: string }; presenting?: number | null }>;
    clientID?: number;
  } | null;
  const [, bump] = useReducer((c: number) => c + 1, 0);
  const [following, setFollowing] = useState<number | null>(null);

  useEffect(() => {
    if (!aw?.on) return;
    const fn = () => bump();
    aw.on('change', fn);
    return () => aw.off?.('change', fn);
  }, [aw]);

  // The presenting peer (first one found that isn't us).
  let presenterId: number | null = null;
  let presenterName = '';
  let presenterIndex = 0;
  if (aw?.getStates) {
    for (const [cid, st] of aw.getStates()) {
      if (cid !== aw.clientID && typeof st?.presenting === 'number') {
        presenterId = cid;
        presenterName = st.user?.name || t('Quelqu’un');
        presenterIndex = st.presenting;
        break;
      }
    }
  }

  // Live-follow: when following, mirror the presenter's slide.
  useEffect(() => {
    if (following != null && presenterId === following) ctx.setActiveIndex(presenterIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [following, presenterIndex, presenterId]);

  if (presenterId == null) {
    if (following != null) setFollowing(null);
    return null;
  }

  const isFollowing = following === presenterId;

  return (
    <div className="follow-banner">
      <Icon name="record_voice_over" />
      <span>
        <strong>{presenterName}</strong> {t('présente (diapo {{n}})', { n: presenterIndex + 1 })}
      </span>
      <button className={isFollowing ? 'is-on' : ''} onClick={() => setFollowing(isFollowing ? null : presenterId)}>
        {isFollowing ? t('Suivi…') : t('Suivre')}
      </button>
      <button onClick={() => ctx.setOverlay('present')}>{t('Ouvrir')}</button>
    </div>
  );
}
