import { useEffect, useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import type { Editor } from '@tiptap/react';
import { Icon } from './ui/Icon';
import { ColorPopover } from './ui/ColorPopover';
import { FONTS, FONT_SIZES, fontStack } from '../data/fonts';
import './TextFormatControls.css';

// Re-render this control set whenever the editor's selection/marks change, so active states and the
// current font/size/color stay in sync as the caret moves.
function useEditorTick(editor: Editor | null) {
  const [, tick] = useReducer((c: number) => c + 1, 0);
  useEffect(() => {
    if (!editor) return;
    const fn = () => tick();
    editor.on('transaction', fn);
    editor.on('selectionUpdate', fn);
    return () => {
      editor.off('transaction', fn);
      editor.off('selectionUpdate', fn);
    };
  }, [editor]);
}

interface Props {
  editor: Editor;
  /** 'dense' = floating toolbar (icon-only, core marks). 'full' = ribbon/inspector. */
  variant?: 'dense' | 'full';
  themeColors?: string[];
}

// Module-scope so its identity is stable across re-renders. (Defined inside the component it would
// get a new identity on every editor tick → React remounts the buttons → the click lands on a node
// that's replaced before the handler fires, which is why a single click didn't apply.)
// onMouseDown preventDefault keeps the text selection from collapsing when the button is pressed.
function TfcBtn({
  on,
  icon,
  label,
  run,
  text,
}: {
  on?: boolean;
  icon?: string;
  label: string;
  run: () => void;
  text?: string;
}) {
  return (
    <button
      type="button"
      className={`tfc-btn${on ? ' is-active' : ''}`}
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {icon ? <Icon name={icon} /> : <span className="tfc-text">{text}</span>}
    </button>
  );
}

export function TextFormatControls({ editor, variant = 'full', themeColors }: Props) {
  const { t } = useTranslation();
  useEditorTick(editor);
  const dense = variant === 'dense';
  const curSize = parseInt(editor.getAttributes('textStyle').fontSize || '', 10);
  const curFamily = editor.getAttributes('textStyle').fontFamily as string | undefined;
  const curColor = (editor.getAttributes('textStyle').color as string | undefined) || '#0f172a';

  const setSize = (n: number) => editor.chain().focus().setFontSize(`${n}px`).run();
  const stepSize = (d: number) => {
    const next = Math.max(6, (curSize || 22) + d);
    setSize(next);
  };

  return (
    <div className={`tfc${dense ? ' tfc-dense' : ''}`}>
      {!dense && (
        <div className="tfc-group">
          <select
            className="tfc-select tfc-font"
            value={FONTS.find((f) => fontStack(f.family) === curFamily)?.family || ''}
            onChange={(e) =>
              e.target.value
                ? editor.chain().focus().setFontFamily(fontStack(e.target.value)).run()
                : editor.chain().focus().unsetFontFamily().run()
            }
            aria-label={t('Police')}
          >
            <option value="">{t('Police…')}</option>
            {FONTS.map((f) => (
              <option key={f.family} value={f.family}>
                {f.family}
              </option>
            ))}
          </select>
          <div className="tfc-size">
            <button type="button" className="tfc-btn" aria-label={t('Réduire')} onMouseDown={(e) => e.preventDefault()} onClick={() => stepSize(-2)}>
              <Icon name="remove" />
            </button>
            <select
              className="tfc-select tfc-sizesel"
              value={curSize || ''}
              onChange={(e) => setSize(Number(e.target.value))}
              aria-label={t('Taille de police')}
            >
              <option value="">-</option>
              {FONT_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button type="button" className="tfc-btn" aria-label={t('Agrandir')} onMouseDown={(e) => e.preventDefault()} onClick={() => stepSize(2)}>
              <Icon name="add" />
            </button>
          </div>
        </div>
      )}

      <div className="tfc-group">
        <TfcBtn on={editor.isActive('bold')} icon="format_bold" label={t('Gras')} run={() => editor.chain().focus().toggleBold().run()} />
        <TfcBtn on={editor.isActive('italic')} icon="format_italic" label={t('Italique')} run={() => editor.chain().focus().toggleItalic().run()} />
        <TfcBtn on={editor.isActive('underline')} icon="format_underlined" label={t('Souligné')} run={() => editor.chain().focus().toggleUnderline().run()} />
        <TfcBtn on={editor.isActive('strike')} icon="format_strikethrough" label={t('Barré')} run={() => editor.chain().focus().toggleStrike().run()} />
        <TfcBtn on={editor.isActive('highlight')} icon="ink_highlighter" label={t('Surligner')} run={() => editor.chain().focus().toggleHighlight().run()} />
        <ColorPopover compact value={curColor} themeColors={themeColors} title={t('Couleur du texte')} onChange={(c) => editor.chain().focus().setColor(c).run()} />
      </div>

      {!dense && (
        <div className="tfc-group">
          <TfcBtn on={editor.isActive('subscript')} icon="subscript" label={t('Indice')} run={() => editor.chain().focus().toggleSubscript().run()} />
          <TfcBtn on={editor.isActive('superscript')} icon="superscript" label={t('Exposant')} run={() => editor.chain().focus().toggleSuperscript().run()} />
        </div>
      )}

      <div className="tfc-group">
        <TfcBtn on={editor.isActive({ textAlign: 'left' })} icon="format_align_left" label={t('Aligner à gauche')} run={() => editor.chain().focus().setTextAlign('left').run()} />
        <TfcBtn on={editor.isActive({ textAlign: 'center' })} icon="format_align_center" label={t('Centrer')} run={() => editor.chain().focus().setTextAlign('center').run()} />
        <TfcBtn on={editor.isActive({ textAlign: 'right' })} icon="format_align_right" label={t('Aligner à droite')} run={() => editor.chain().focus().setTextAlign('right').run()} />
        {!dense && (
          <TfcBtn on={editor.isActive({ textAlign: 'justify' })} icon="format_align_justify" label={t('Justifier')} run={() => editor.chain().focus().setTextAlign('justify').run()} />
        )}
      </div>

      <div className="tfc-group">
        <TfcBtn on={editor.isActive('bulletList')} icon="format_list_bulleted" label={t('Liste à puces')} run={() => editor.chain().focus().toggleBulletList().run()} />
        <TfcBtn on={editor.isActive('orderedList')} icon="format_list_numbered" label={t('Liste numérotée')} run={() => editor.chain().focus().toggleOrderedList().run()} />
        {!dense && (
          <>
            <TfcBtn icon="format_indent_decrease" label={t('Diminuer le retrait')} run={() => editor.chain().focus().liftListItem('listItem').run()} />
            <TfcBtn icon="format_indent_increase" label={t('Augmenter le retrait')} run={() => editor.chain().focus().sinkListItem('listItem').run()} />
          </>
        )}
      </div>

      <div className="tfc-group">
        <TfcBtn
          on={editor.isActive('link')}
          icon="link"
          label={t('Lien')}
          run={() => {
            const prev = editor.getAttributes('link').href as string | undefined;
            const url = window.prompt(t('Adresse du lien (URL) :'), prev || 'https://');
            if (url === null) return;
            if (url === '') editor.chain().focus().unsetLink().run();
            else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
          }}
        />
        {!dense && (
          <TfcBtn icon="format_clear" label={t('Effacer la mise en forme')} run={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} />
        )}
      </div>
    </div>
  );
}
