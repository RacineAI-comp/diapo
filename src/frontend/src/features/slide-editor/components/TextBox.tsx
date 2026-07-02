import { useEffect, useMemo } from 'react';
import i18next from '../../../i18n';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import * as Y from 'yjs';
import { FontSize } from '../tiptap/FontSize';
import { getTextFragment, syncPlainTextMirror } from '../crdt/text.js';
import type { SlideObjectView as ObjView, YSlide } from '../crdt/scene';
import { useEditorCtx } from '../state/editorContext';
import { TextFormatControls } from './TextFormatControls';
import './TextBox.css';

// A Tiptap editor bound to the object's Y.XmlFragment via y-prosemirror
// (Collaboration extension), so formatting + per-character collaboration work. The outer div
// (SlideObjectView) stays the Moveable drag target; double-click enters edit mode. The floating
// format toolbar appears in edit mode; the same editor is also published to the editor context so
// the ribbon and inspector can drive formatting on it.
interface Props {
  slide: YSlide;
  o: ObjView;
  editing: boolean;
}

export function TextBox({ slide, o, editing }: Props) {
  const ctx = useEditorCtx();
  const objects = slide.get('objects') as Y.Map<Y.Map<unknown>> | undefined;
  const map = objects?.get(o.id);

  const fragment = useMemo<Y.XmlFragment | null>(
    () => (map ? getTextFragment(map) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map, o.id],
  );

  const editor = useEditor(
    {
      editable: false,
      extensions: fragment
        ? [
            StarterKit.configure({ history: false }), // Collaboration owns history
            TextStyle,
            Color,
            FontFamily,
            FontSize,
            Underline,
            Highlight.configure({ multicolor: false }),
            Subscript,
            Superscript,
            Link.configure({ openOnClick: false, autolink: true }),
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Placeholder.configure({ placeholder: o.ph ? '' : i18next.t('Saisissez du texte…'), showOnlyWhenEditable: false }),
            Collaboration.configure({ fragment }),
          ]
        : [StarterKit.configure({ history: false })],
      // Native browser spell-check is local & offline (no cloud), a sovereign default. lang hints
      // the dictionary (follows the UI language); a Hunspell/WASM custom-dictionary path can layer
      // on later.
      editorProps: { attributes: { class: 'textbox-content', 'aria-label': i18next.t('Zone de texte'), spellcheck: 'true', lang: i18next.resolvedLanguage || 'fr' } },
      onUpdate: () => map && syncPlainTextMirror(map),
    },
    [fragment],
  );

  useEffect(() => {
    if (map) syncPlainTextMirror(map);
  }, [map, fragment]);

  // Edit mode: become editable + focus, and publish the editor to the context (so ribbon/inspector
  // can format it). Clean up on leaving edit mode / unmount.
  useEffect(() => {
    if (!editor) return;
    // readOnly wins over edit mode: Tiptap stays non-editable in view-only sessions.
    editor.setEditable(editing && !ctx.readOnly);
    if (editing && !ctx.readOnly) {
      editor.commands.focus('end');
      ctx.setActiveEditor(editor);
    } else {
      ctx.setActiveEditor((cur) => (cur === editor ? null : cur));
    }
    return () => {
      ctx.setActiveEditor((cur) => (cur === editor ? null : cur));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, editor, ctx.readOnly]);

  if (!map || !editor) return <div className="textbox" />;

  return (
    <div className="textbox">
      {editing && !ctx.readOnly && (
        <div
          className="textbox-toolbar"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.preventDefault()}
        >
          <TextFormatControls editor={editor} variant="dense" themeColors={ctx.theme?.palette} />
        </div>
      )}
      <EditorContent editor={editor} className="textbox-editor" />
    </div>
  );
}
