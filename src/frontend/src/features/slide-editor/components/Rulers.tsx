import './Rulers.css';

// Horizontal + vertical rulers around the slide (View → Règles). Tick marks every 50 slide units,
// labels every 100; scaled to match the current zoom and sitting just outside the slide edges.
export function Rulers({ w, h, scale }: { w: number; h: number; scale: number }) {
  const step = 50;
  const xs = Array.from({ length: Math.floor(w / step) + 1 }, (_, i) => i * step);
  const ys = Array.from({ length: Math.floor(h / step) + 1 }, (_, i) => i * step);
  return (
    <>
      <div className="ruler ruler-h" style={{ width: w * scale }}>
        {xs.map((u) => (
          <span key={u} className={`ruler-tick${u % 100 === 0 ? ' major' : ''}`} style={{ left: u * scale }}>
            {u % 100 === 0 && <i>{u}</i>}
          </span>
        ))}
      </div>
      <div className="ruler ruler-v" style={{ height: h * scale }}>
        {ys.map((u) => (
          <span key={u} className={`ruler-tick${u % 100 === 0 ? ' major' : ''}`} style={{ top: u * scale }}>
            {u % 100 === 0 && <i>{u}</i>}
          </span>
        ))}
      </div>
    </>
  );
}
