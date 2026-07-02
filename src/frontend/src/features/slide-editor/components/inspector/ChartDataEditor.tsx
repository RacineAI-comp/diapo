import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setProp } from '../../crdt/scene.js';
import type { ChartData, SlideObjectView, YSlide } from '../../crdt/scene';
import { parseSheet, toChartMatrix } from '../../lib/parseSheet';
import { Icon } from '../ui/Icon';

// Compact data grid for a chart object: rows = categories, columns = series. Edits write the whole
// data object back (LWW per object). Single-series add/remove keeps it simple but covers the 80%.
export function ChartDataEditor({ slide, o }: { slide: YSlide; o: SlideObjectView }) {
  const { t } = useTranslation();
  const data: ChartData = o.data && o.data.categories?.length
    ? o.data
    : { categories: [t('T{{n}}', { n: 1 }), t('T{{n}}', { n: 2 })], series: [{ name: t('Série {{n}}', { n: 1 }), values: [1, 2] }] };

  const commit = (next: ChartData) => setProp(slide, o.id, 'data', next);

  const setCat = (i: number, label: string) => {
    const cats = data.categories.slice();
    cats[i] = label;
    commit({ ...data, categories: cats });
  };
  const setVal = (si: number, ci: number, v: number) => {
    const series = data.series.map((s, k) =>
      k === si ? { ...s, values: s.values.map((x, j) => (j === ci ? v : x)) } : s,
    );
    commit({ ...data, series });
  };
  const setSeriesName = (si: number, name: string) => {
    commit({ ...data, series: data.series.map((s, k) => (k === si ? { ...s, name } : s)) });
  };
  const addRow = () => {
    commit({
      categories: [...data.categories, t('T{{n}}', { n: data.categories.length + 1 })],
      series: data.series.map((s) => ({ ...s, values: [...s.values, 0] })),
    });
  };
  const removeRow = (i: number) => {
    if (data.categories.length <= 1) return;
    commit({
      categories: data.categories.filter((_, k) => k !== i),
      series: data.series.map((s) => ({ ...s, values: s.values.filter((_, k) => k !== i) })),
    });
  };
  const addSeries = () => {
    commit({
      ...data,
      series: [...data.series, { name: t('Série {{n}}', { n: data.series.length + 1 }), values: data.categories.map(() => 0) }],
    });
  };

  // Spreadsheet import (paste from Excel/Calc, or a .csv file). toChartMatrix expects
  // categories down the rows and series across the columns, transposing wider-than-tall
  // grids and treating a text first row/column as headers (see lib/parseSheet).
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const applyText = (text: string) => {
    const m = toChartMatrix(parseSheet(text));
    if (!m || !m.series.length) {
      setImportError(t('Données non reconnues : collez un tableau de nombres, avec au besoin une ligne et une colonne d’en-têtes.'));
      return;
    }
    setImportError(null);
    commit({
      categories: m.categories.map((c, i) => c || t('T{{n}}', { n: i + 1 })),
      series: m.series.map((s, i) => ({ name: s.name || t('Série {{n}}', { n: i + 1 }), values: s.values })),
    });
    setPasteOpen(false);
    setPasteText('');
  };

  return (
    <div className="chart-data">
      <table>
        <thead>
          <tr>
            <th />
            {data.series.map((s, si) => (
              <th key={si}>
                <input value={s.name} onChange={(e) => setSeriesName(si, e.target.value)} aria-label={t('Nom de série')} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.categories.map((cat, ci) => (
            <tr key={ci}>
              <th>
                <input value={cat} onChange={(e) => setCat(ci, e.target.value)} aria-label={t('Catégorie')} />
              </th>
              {data.series.map((s, si) => (
                <td key={si}>
                  <input
                    type="number"
                    value={s.values[ci] ?? 0}
                    onChange={(e) => setVal(si, ci, Number(e.target.value) || 0)}
                    aria-label={t('Valeur')}
                  />
                </td>
              ))}
              <td className="chart-data-del">
                <button onClick={() => removeRow(ci)} title={t('Supprimer la ligne')} aria-label={t('Supprimer la ligne')}>
                  <Icon name="close" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="chart-data-actions">
        <button onClick={addRow}>
          <Icon name="add" /> {t('Ajouter une ligne')}
        </button>
        <button onClick={addSeries}>
          <Icon name="add" /> {t('Ajouter une série')}
        </button>
      </div>
      <div className="chart-data-actions">
        <button onClick={() => { setPasteOpen(!pasteOpen); setImportError(null); }} aria-expanded={pasteOpen}>
          <Icon name="content_paste" /> {t('Coller des données')}
        </button>
        <button onClick={() => fileRef.current?.click()}>
          <Icon name="upload_file" /> {t('Importer un CSV')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,text/csv,text/tab-separated-values"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) applyText(await f.text());
          }}
        />
      </div>
      {pasteOpen && (
        <div style={{ marginTop: 6 }}>
          <textarea
            value={pasteText}
            rows={4}
            placeholder={t('Collez ici des cellules copiées depuis Excel ou LibreOffice Calc.')}
            aria-label={t('Coller des données')}
            style={{ width: '100%', font: 'inherit', fontSize: 12, padding: 4, border: '1px solid var(--line)', borderRadius: 4, resize: 'vertical' }}
            onChange={(e) => setPasteText(e.target.value)}
            onPaste={(e) => {
              const txt = e.clipboardData.getData('text/plain');
              if (!txt) return;
              e.preventDefault();
              setPasteText(txt);
              applyText(txt);
            }}
          />
          <div className="chart-data-actions" style={{ marginTop: 4 }}>
            <button onClick={() => applyText(pasteText)} disabled={!pasteText.trim()}>
              <Icon name="check" /> {t('Appliquer')}
            </button>
          </div>
        </div>
      )}
      {importError && (
        <p role="alert" style={{ color: '#b91c1c', fontSize: 12, margin: '6px 0 0' }}>{importError}</p>
      )}
    </div>
  );
}
