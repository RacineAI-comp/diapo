import { useEffect, useRef } from 'react';
import { setProp } from '../../crdt/scene.js';
import type { CellStyle, SlideObjectView as ObjView, YSlide } from '../../crdt/scene';
import './TableObject.css';

interface Props {
  slide: YSlide;
  o: ObjView;
  editing: boolean;
}

// Default cell text colour contrasts the slide background (dark slide → light text).
function inkFor(hex: string): string {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length < 6) return '#0f172a';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5 ? '#f8fafc' : '#0f172a';
}

// Normalize the stored cells into a rows x cols grid of strings (tolerant of ragged/empty data).
function grid(o: ObjView): string[][] {
  const rows = o.rows ?? (o.cells?.length || 2);
  const cols = o.cols ?? (o.cells?.[0]?.length || 2);
  const out: string[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < cols; c++) row.push(o.cells?.[r]?.[c] ?? '');
    out.push(row);
  }
  return out;
}

const cellStyleAt = (o: ObjView, r: number, c: number): CellStyle | undefined =>
  o.cellStyles?.[r]?.[c];

// A table object: an HTML table filling the box. Cells become editable (contentEditable) when the
// object is in edit mode (double-click). Edits write the whole grid back (LWW per object), fine
// for the cadence of table editing; per-character collab is reserved for text boxes.
//
// Imported tables additionally carry per-cell styling (cellStyles), real column widths / row heights
// (colWidths / rowHeights) and merges (span/rowSpan/merged) so they match the source layout instead
// of a uniform grid. Editor-created tables leave those unset and render with the simple model.
export function TableObject({ slide, o, editing }: Props) {
  const data = grid(o);
  const cellStyles = o.cellStyles;
  // Only draw borders / a styled header when the source table actually has them, a borderless,
  // no-fill table (common as a layout grid) must render as plain aligned text, not a grey grid.
  const hasBorder = !!o.stroke;
  const hasHeader = !!o.fill && !cellStyles; // per-cell fills supersede the single-header model
  const slideInk = inkFor((slide.get('background') as string) || '#ffffff');

  const writeCell = (r: number, c: number, value: string) => {
    const next = grid(o).map((row) => row.slice());
    next[r][c] = value;
    setProp(slide, o.id, 'cells', next);
  };

  // Real column widths → a <colgroup> (percentages). Falls back to even auto-distribution.
  const colWidths = o.colWidths && o.colWidths.length ? o.colWidths : null;
  const colTotal = colWidths ? colWidths.reduce((a, b) => a + b, 0) || 1 : 0;
  const rowHeights = o.rowHeights && o.rowHeights.length ? o.rowHeights : null;
  const rowTotal = rowHeights ? rowHeights.reduce((a, b) => a + b, 0) || 1 : 0;

  return (
    <table
      className={`tbl-object${o.banding ? ' is-banded' : ''}${hasBorder ? ' is-bordered' : ''}${hasHeader ? ' is-headed' : ''}`}
      style={{
        color: slideInk,
        ['--tbl-border' as string]: o.stroke || 'transparent',
        ['--tbl-header' as string]: o.fill || 'transparent',
      }}
    >
      {colWidths && (
        <colgroup>
          {colWidths.map((w, i) => (
            <col key={i} style={{ width: `${(w / colTotal) * 100}%` }} />
          ))}
        </colgroup>
      )}
      <tbody>
        {data.map((row, r) => (
          <tr
            key={r}
            className={r === 0 && hasHeader ? 'tbl-head' : ''}
            style={rowHeights ? { height: `${((rowHeights[r] ?? 0) / rowTotal) * 100}%` } : undefined}
          >
            {row.map((cell, c) => {
              const cs = cellStyleAt(o, r, c);
              if (cs?.merged) return null; // continuation of a merge, covered by the origin cell
              return (
                <Cell
                  key={c}
                  value={cell}
                  style={cs}
                  slideInk={slideInk}
                  editing={editing}
                  onCommit={(v) => writeCell(r, c, v)}
                />
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Cell({
  value,
  style,
  slideInk,
  editing,
  onCommit,
}: {
  value: string;
  style?: CellStyle;
  slideInk: string;
  editing: boolean;
  onCommit: (v: string) => void;
}) {
  const ref = useRef<HTMLTableCellElement>(null);
  // Keep the DOM text in sync with the model when not focused (so remote edits show).
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== value) el.textContent = value;
  }, [value]);

  // A per-cell fill picks its own contrasting ink unless the source already set a text colour.
  const ink = style?.color || (style?.fill ? inkFor(style.fill) : slideInk);
  const valignMap = { top: 'top', middle: 'middle', bottom: 'bottom' } as const;

  return (
    <td
      ref={ref}
      colSpan={style?.span}
      rowSpan={style?.rowSpan}
      contentEditable={editing}
      suppressContentEditableWarning
      onPointerDown={(e) => editing && e.stopPropagation()}
      onBlur={(e) => onCommit(e.currentTarget.textContent || '')}
      style={{
        background: style?.fill || undefined,
        color: style?.fill || style?.color ? ink : undefined,
        textAlign: style?.align,
        verticalAlign: style?.valign ? valignMap[style.valign] : undefined,
        fontWeight: style?.bold ? 700 : undefined,
        border: style?.borderColor
          ? `${style.borderWidth || 1}px solid ${style.borderColor}`
          : undefined,
      }}
    />
  );
}
