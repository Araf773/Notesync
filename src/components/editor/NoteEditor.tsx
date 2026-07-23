/**
 * The rich-text note editor.
 *
 * Binds Tiptap to the note's Yjs document via the Collaboration extension, so
 * every keystroke flows into the CRDT (local persistence + cloud sync happen
 * underneath, see useNoteDoc + firestoreYProvider). Because Yjs owns history, we
 * disable StarterKit's own history to avoid conflicts (per Tiptap's collab docs).
 *
 * On content change we debounce-extract a plain-text preview into note metadata
 * for search and card previews.
 */
import { useEffect, useMemo } from 'react';
import type * as Y from 'yjs';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { EditorToolbar } from './EditorToolbar';
import { extractPreview, YJS_FRAGMENT } from '@/data/yjsManager';
import { updateContentPreview } from '@/data/notesRepo';
import { debounce } from '@/lib/utils';

interface NoteEditorProps {
  noteId: string;
  doc: Y.Doc;
  fontFamily: string;
  fontSize: string;
}

export function NoteEditor({ noteId, doc, fontFamily, fontSize }: NoteEditorProps) {
  // Debounced preview writer — avoids hammering Dexie on every keystroke.
  const persistPreview = useMemo(
    () =>
      debounce((text: string) => {
        void updateContentPreview(noteId, text);
      }, 600),
    [noteId],
  );

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          // Yjs manages undo/redo history in collaborative mode.
          history: false,
          heading: { levels: [1, 2, 3] },
        }),
        Collaboration.configure({ document: doc, field: YJS_FRAGMENT }),
        Underline,
        Highlight.configure({ multicolor: false }),
        Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer nofollow' } }),
        Image.configure({ inline: false, allowBase64: true }),
        Placeholder.configure({ placeholder: 'Start writing…' }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
      ],
      editorProps: {
        attributes: {
          class:
            'prose prose-neutral dark:prose-invert max-w-none focus:outline-none min-h-[50vh] px-4 py-6',
          spellcheck: 'true',
        },
      },
      onUpdate: ({ editor: ed }) => {
        // Extract from the ProseMirror text directly (cheap, already in memory).
        persistPreview(ed.getText().slice(0, 300));
      },
    },
    [doc],
  );

  // On first mount, seed the preview from existing doc content (e.g. synced note).
  useEffect(() => {
    if (!editor) return;
    const initial = extractPreview(doc);
    if (initial) persistPreview(initial);
    return () => persistPreview.flush();
  }, [editor, doc, persistPreview]);

  return (
    <div className="flex h-full flex-col">
      <EditorToolbar editor={editor} />
      <div
        className="note-surface flex-1 overflow-y-auto"
        style={{ fontFamily, fontSize }}
        onClick={() => editor?.chain().focus().run()}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
