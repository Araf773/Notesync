/**
 * Navigation sidebar: filters (All / Pinned / Trash), folders, and tags.
 * Doubles as a slide-over on small screens (controlled by the parent).
 */
import { useState } from 'react';
import {
  NotebookText,
  Pin,
  Trash2,
  Folder as FolderIcon,
  Hash,
  Plus,
  Pencil,
  X,
  Settings,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useNotesStore, type NotesFilter } from '@/store/notesStore';
import { useFolders, useTags, useTrashCount } from '@/data/queries';
import { createFolder, renameFolder, deleteFolder } from '@/data/notesRepo';

interface SidebarProps {
  ownerId: string;
  onOpenSettings: () => void;
  onNavigate?: () => void;
}

function isSameFilter(a: NotesFilter, b: NotesFilter): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'folder' && b.kind === 'folder') return a.folderId === b.folderId;
  if (a.kind === 'tag' && b.kind === 'tag') return a.tag === b.tag;
  return true;
}

export function Sidebar({ ownerId, onOpenSettings, onNavigate }: SidebarProps) {
  const filter = useNotesStore((s) => s.filter);
  const setFilter = useNotesStore((s) => s.setFilter);
  const folders = useFolders(ownerId);
  const tags = useTags(ownerId);
  const trashCount = useTrashCount(ownerId);

  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const select = (f: NotesFilter) => {
    setFilter(f);
    onNavigate?.();
  };

  const submitNewFolder = async () => {
    const name = newFolderName.trim();
    if (name) await createFolder(ownerId, name);
    setNewFolderName('');
    setAddingFolder(false);
  };

  const submitRename = async (id: string) => {
    const name = editName.trim();
    if (name) await renameFolder(id, name);
    setEditingId(null);
  };

  const NavItem = ({
    active,
    icon: Icon,
    label,
    count,
    onClick,
  }: {
    active: boolean;
    icon: React.ElementType;
    label: string;
    count?: number;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
        active ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 truncate text-left">{label}</span>
      {count !== undefined && count > 0 && <span className="text-xs text-muted-foreground">{count}</span>}
    </button>
  );

  return (
    <nav className="flex h-full w-64 flex-col border-r bg-muted/20" aria-label="Notes navigation">
      <div className="flex items-center gap-2 border-b px-4 py-3.5">
        <NotebookText className="size-5 text-primary" />
        <span className="font-semibold">NoteSync</span>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-2">
        <div className="space-y-0.5">
          <NavItem active={filter.kind === 'all'} icon={NotebookText} label="All notes" onClick={() => select({ kind: 'all' })} />
          <NavItem active={filter.kind === 'pinned'} icon={Pin} label="Pinned" onClick={() => select({ kind: 'pinned' })} />
          <NavItem active={filter.kind === 'trash'} icon={Trash2} label="Trash" count={trashCount} onClick={() => select({ kind: 'trash' })} />
        </div>

        <div>
          <div className="flex items-center justify-between px-2.5 py-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Folders</span>
            <button type="button" aria-label="New folder" className="text-muted-foreground hover:text-foreground" onClick={() => setAddingFolder(true)}>
              <Plus className="size-4" />
            </button>
          </div>

          {addingFolder && (
            <div className="flex items-center gap-1 px-1 py-1">
              <Input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitNewFolder();
                  if (e.key === 'Escape') setAddingFolder(false);
                }}
                onBlur={submitNewFolder}
                placeholder="Folder name"
                className="h-8 text-sm"
              />
            </div>
          )}

          <div className="space-y-0.5">
            {folders?.map((folder) => (
              <div key={folder.id} className="group/folder flex items-center">
                {editingId === folder.id ? (
                  <Input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void submitRename(folder.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onBlur={() => submitRename(folder.id)}
                    className="h-8 text-sm"
                  />
                ) : (
                  <>
                    <NavItem
                      active={filter.kind === 'folder' && isSameFilter(filter, { kind: 'folder', folderId: folder.id })}
                      icon={FolderIcon}
                      label={folder.name}
                      onClick={() => select({ kind: 'folder', folderId: folder.id })}
                    />
                    <div className="flex opacity-0 transition-opacity group-hover/folder:opacity-100">
                      <button
                        type="button"
                        aria-label={`Rename ${folder.name}`}
                        className="p-1 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setEditingId(folder.id);
                          setEditName(folder.name);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${folder.name}`}
                        className="p-1 text-muted-foreground hover:text-destructive"
                        onClick={() => void deleteFolder(folder.id)}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {folders?.length === 0 && !addingFolder && (
              <p className="px-2.5 py-1 text-xs text-muted-foreground">No folders yet</p>
            )}
          </div>
        </div>

        {tags && tags.length > 0 && (
          <div>
            <span className="block px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</span>
            <div className="space-y-0.5">
              {tags.map((tag) => (
                <NavItem
                  key={tag}
                  active={filter.kind === 'tag' && isSameFilter(filter, { kind: 'tag', tag })}
                  icon={Hash}
                  label={tag}
                  onClick={() => select({ kind: 'tag', tag })}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t p-2">
        <NavItem active={false} icon={Settings} label="Settings" onClick={onOpenSettings} />
      </div>
    </nav>
  );
}
