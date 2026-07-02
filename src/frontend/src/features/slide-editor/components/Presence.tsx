import { useEffect, useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import './Presence.css';

interface Props {
  awareness: any; // y-protocols Awareness | null
}

function initials(name = '?'): string {
  return name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
}

// Pick readable text color for an arbitrary avatar background (WCAG-ish luminance).
function textOn(bg = '#888888'): string {
  const h = bg.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const i = parseInt(n, 16);
  if (Number.isNaN(i)) return '#ffffff';
  const r = (i >> 16) & 255,
    g = (i >> 8) & 255,
    b = i & 255;
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return L > 0.6 ? '#0f172a' : '#ffffff';
}

// Collaborators as an overlapping avatar stack (header). "You" first; overflow collapses to +N.
export function Presence({ awareness }: Props) {
  const { t } = useTranslation();
  const [, bump] = useReducer((c: number) => c + 1, 0);
  useEffect(() => {
    if (!awareness) return;
    const fn = () => bump();
    awareness.on('change', fn);
    return () => awareness.off('change', fn);
  }, [awareness]);

  if (!awareness) return null;
  const myId: number = awareness.clientID;
  const users = (Array.from(awareness.getStates().entries()) as Array<[number, any]>)
    .filter(([, s]) => s?.user)
    .map(([id, s]) => ({ id, you: id === myId, name: s.user.name as string, color: s.user.color as string }))
    .sort((a, b) => Number(b.you) - Number(a.you)); // you first

  if (users.length === 0) return null;
  const MAX = 4;
  const shown = users.slice(0, MAX);
  const extra = users.length - shown.length;

  return (
    <div className="presence-stack" aria-label={t('{{count}} personne connectée', { count: users.length })}>
      {shown.map((u) => (
        <span
          key={u.id}
          className={`avatar${u.you ? ' is-you' : ''}`}
          style={{ background: u.color, color: textOn(u.color) }}
          title={u.you ? t('Vous ({{name}})', { name: u.name }) : u.name}
        >
          {initials(u.name)}
        </span>
      ))}
      {extra > 0 && (
        <span className="avatar avatar--more" title={t('{{count}} autre', { count: extra })}>
          +{extra}
        </span>
      )}
    </div>
  );
}
