// TSV/CSV parsing for spreadsheet paste and .csv import (chart data editor, table paste).
// Excel/Calc put TSV on the clipboard; French locales export ;-separated CSV with decimal commas.

export type Grid = string[][];

// Raw record split honouring RFC 4180 quoting: "" escapes a quote, delimiters and newlines
// inside quotes are literal. Accepts \r\n, \n and \r record breaks. Rows may be ragged.
function parseRaw(text: string, delimiter: string): Grid {
  const rows: Grid = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === '') {
      quoted = true;
      i++;
      continue;
    }
    if (c === delimiter) {
      endField();
      i++;
      continue;
    }
    if (c === '\n') {
      endRow();
      i++;
      continue;
    }
    if (c === '\r') {
      endRow();
      i += text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += c;
    i++;
  }
  if (field !== '' || row.length) endRow();
  return rows;
}

// Drop trailing empty rows/columns and pad ragged rows to a rectangle.
function trimGrid(raw: Grid): Grid {
  const rows = raw.slice();
  while (rows.length && rows[rows.length - 1].every((c) => c.trim() === '')) rows.pop();
  let width = 0;
  for (const r of rows) {
    for (let j = r.length - 1; j >= 0; j--) {
      if (r[j].trim() !== '') {
        width = Math.max(width, j + 1);
        break;
      }
    }
  }
  return rows.map((r) => Array.from({ length: width }, (_, j) => r[j] ?? ''));
}

// Pick the delimiter that splits the sample into a consistent column count > 1, trying
// tab (Excel/Calc clipboard) then ; (French CSV) then , in that order. When none is fully
// consistent, keep the candidate producing the most columns on the first record.
export function detectDelimiter(text: string): string {
  const candidates = ['\t', ';', ','];
  let best = '\t';
  let bestCols = 1;
  for (const d of candidates) {
    const rows = parseRaw(text, d).filter((r) => r.some((c) => c.trim() !== ''));
    if (!rows.length) continue;
    const cols = rows[0].length;
    if (cols > 1 && rows.every((r) => r.length === cols)) return d;
    if (cols > bestCols) {
      bestCols = cols;
      best = d;
    }
  }
  return best;
}

// Delimiter-explicit parse, rectangular output.
export function parseDelimited(text: string, delimiter: string): Grid {
  return trimGrid(parseRaw(text, delimiter));
}

// One-call parse with delimiter auto-detection.
export function parseSheet(text: string): Grid {
  return parseDelimited(text, detectDelimiter(text));
}

// Numeric cell parse tolerant of locale formats: "42", "-0.5", "1e3", French "3,14" and
// "1 234,5" (space or nbsp thousands), grouped "1.234,56" / "1,234.56". A single-group
// "1,234" reads as the French decimal 1.234 (French-first product), "1.234" as 1.234.
// Returns null when the cell is not a number.
export function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(/[ \u00a0\u202f]/g, '');
  if (!s) return null;
  if (/^-?\d+(?:[eE][+-]?\d+)?$/.test(s)) return Number(s);
  if (/^-?\d{1,3}(?:\.\d{3})+,\d+$/.test(s) || /^-?\d{1,3}(?:\.\d{3}){2,}$/.test(s)) {
    return Number(s.replace(/\./g, '').replace(',', '.'));
  }
  if (/^-?\d{1,3}(?:,\d{3})+\.\d+$/.test(s) || /^-?\d{1,3}(?:,\d{3}){2,}$/.test(s)) {
    return Number(s.replace(/,/g, ''));
  }
  if (/^-?\d*,\d+$/.test(s)) return Number(s.replace(',', '.'));
  if (/^-?\d*\.\d+(?:[eE][+-]?\d+)?$/.test(s)) return Number(s);
  return null;
}

export interface ChartMatrix {
  categories: string[];
  series: { name: string; values: number[] }[];
}

const isNumeric = (s: string) => parseNumber(s) !== null;

// Grid -> chart data. Rules, in order:
//   1. grids wider than tall are transposed (categories normally run down the rows)
//   2. row 0 is a series-name header when any cell past the corner is non-empty text
//   3. column 0 holds categories when any cell below the header is non-empty text
// Every body cell must be numeric (empty = 0), otherwise null so the caller can show an
// error. Missing headers come back as '' for the caller to fill with localised defaults.
export function toChartMatrix(grid: Grid): ChartMatrix | null {
  let g = grid.filter((r) => r.some((c) => c.trim() !== ''));
  if (!g.length || !g[0].length) return null;
  if (g[0].length > g.length) {
    g = g[0].map((_, j) => g.map((r) => r[j] ?? ''));
  }
  const isText = (c: string) => c.trim() !== '' && !isNumeric(c);
  const headerRow = g.length > 1 && g[0].slice(1).some(isText);
  const r0 = headerRow ? 1 : 0;
  const headerCol = g[0].length > 1 && g.slice(r0).some((r) => isText(r[0]));
  const c0 = headerCol ? 1 : 0;
  const nRows = g.length - r0;
  const nCols = g[0].length - c0;
  if (nRows < 1 || nCols < 1) return null;
  const categories: string[] = [];
  for (let i = 0; i < nRows; i++) categories.push(headerCol ? g[r0 + i][0].trim() : '');
  const series: ChartMatrix['series'] = [];
  for (let j = 0; j < nCols; j++) {
    const values: number[] = [];
    for (let i = 0; i < nRows; i++) {
      const cell = g[r0 + i][c0 + j];
      if (cell.trim() === '') {
        values.push(0);
        continue;
      }
      const n = parseNumber(cell);
      if (n === null) return null;
      values.push(n);
    }
    series.push({ name: headerRow ? g[0][c0 + j].trim() : '', values });
  }
  return { categories, series };
}
