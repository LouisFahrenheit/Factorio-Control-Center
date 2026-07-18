import { Fragment, useCallback, useState } from 'react';
import type { CommandEditorApi } from '../../hooks/useCommandEditor';

const DRAG_CMD = 'cmd:';
const DRAG_CAT = 'cat:';

type DragKind = 'command' | 'category' | null;

type CommandDropTarget = { kind: 'command'; categoryKey: string; index: number };
type CategoryDropTarget = { kind: 'category'; index: number };
type DropTarget = CommandDropTarget | CategoryDropTarget | null;

interface CommandEditorNavProps {
  editor: CommandEditorApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

function parseDragPayload(raw: string): { kind: DragKind; id: string } | null {
  const text = String(raw || '').trim();
  if (text.startsWith(DRAG_CAT)) return { kind: 'category', id: text.slice(DRAG_CAT.length) };
  if (text.startsWith(DRAG_CMD)) return { kind: 'command', id: text.slice(DRAG_CMD.length) };
  if (text) return { kind: 'command', id: text };
  return null;
}

function commandDropKey(target: CommandDropTarget | null): string {
  if (!target) return '';
  return `cmd:${target.categoryKey}:${target.index}`;
}

export function CommandEditorNav({ editor, t }: CommandEditorNavProps) {
  const [dragKind, setDragKind] = useState<DragKind>(null);
  const [dragId, setDragId] = useState('');
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);

  const clearDrag = useCallback(() => {
    setDragKind(null);
    setDragId('');
    setDropTarget(null);
  }, []);

  const onCommandDragStart = useCallback((commandId: string, ev: React.DragEvent) => {
    setDragKind('command');
    setDragId(commandId);
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', `${DRAG_CMD}${commandId}`);
  }, []);

  const onCategoryDragStart = useCallback((categoryKey: string, ev: React.DragEvent) => {
    setDragKind('category');
    setDragId(categoryKey);
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', `${DRAG_CAT}${categoryKey}`);
  }, []);

  const onDragOverCommand = useCallback((categoryKey: string, index: number, ev: React.DragEvent) => {
    if (dragKind !== 'command') return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = 'move';
    setDropTarget({ kind: 'command', categoryKey, index });
  }, [dragKind]);

  const onDragOverCategory = useCallback((index: number, ev: React.DragEvent) => {
    if (dragKind !== 'category') return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = 'move';
    setDropTarget({ kind: 'category', index });
  }, [dragKind]);

  const onDropCommand = useCallback(
    (categoryKey: string, index: number, ev: React.DragEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      const payload = parseDragPayload(ev.dataTransfer.getData('text/plain') || dragId);
      if (payload?.kind === 'command' && payload.id) {
        editor.moveCommand(payload.id, categoryKey, index);
      }
      clearDrag();
    },
    [clearDrag, dragId, editor],
  );

  const onDropCategory = useCallback(
    (index: number, ev: React.DragEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      const payload = parseDragPayload(ev.dataTransfer.getData('text/plain') || dragId);
      if (payload?.kind === 'category' && payload.id) {
        editor.moveCategoryOrder(payload.id, index);
      }
      clearDrag();
    },
    [clearDrag, dragId, editor],
  );

  if (!editor.categoryKeys.length) {
    return <p className="command-editor-dialog__empty-hint">{t('commands_add_category_first')}</p>;
  }

  const activeCommandDropKey =
    dropTarget?.kind === 'command' ? commandDropKey(dropTarget) : '';

  return (
    <div className={'command-editor-dialog__nav-scroll' + (dragKind === 'category' ? ' is-dragging-category' : '')}>
      {editor.categoryKeys.map((catKey, catIndex) => {
        const cat = editor.catalog.categories[catKey];
        const commands = cat?.commands || [];
        const catSelected = catKey === editor.selectedCategoryKey;
        const catDragging = dragKind === 'category' && dragId === catKey;
        const catDropBefore =
          dropTarget?.kind === 'category' && dropTarget.index === catIndex;

        return (
          <Fragment key={catKey}>
            <div
              className={
                'command-editor-dialog__cat-drop-slot' +
                (catDropBefore ? ' is-drop-target' : '')
              }
              onDragOver={(ev) => onDragOverCategory(catIndex, ev)}
              onDrop={(ev) => onDropCategory(catIndex, ev)}
            />
            <section
              className={
                'command-editor-dialog__cat-section' +
                (catSelected ? ' command-editor-dialog__cat-section--active' : '') +
                (catDragging ? ' is-dragging' : '')
              }
            >
              <div className="command-editor-dialog__category-row">
                <span
                  className="command-editor-dialog__drag-handle command-editor-dialog__drag-handle--category"
                  draggable
                  title={t('category_drag_hint')}
                  aria-label={t('category_drag_hint')}
                  onDragStart={(ev) => onCategoryDragStart(catKey, ev)}
                  onDragEnd={clearDrag}
                >
                  ⋮⋮
                </span>
                <button
                  type="button"
                  className={'command-editor-dialog__category' + (catSelected ? ' is-selected' : '')}
                  onClick={() => editor.setSelectedCategoryKey(catKey)}
                  onDragOver={(ev) => {
                    if (dragKind === 'command') onDragOverCommand(catKey, commands.length, ev);
                  }}
                  onDrop={(ev) => {
                    if (dragKind === 'command') onDropCommand(catKey, commands.length, ev);
                  }}
                >
                  {cat?.name || catKey}
                </button>
              </div>
              <ul className="command-editor-dialog__commands">
                {commands.map((item, index) => {
                  const slotKey = `${catKey}:${index}`;
                  const isDropHere = activeCommandDropKey === `cmd:${slotKey}`;
                  const isDragging = dragKind === 'command' && dragId === item.id;
                  const isSelected = item.id === editor.selectedCommandId;

                  return (
                    <li
                      key={item.id}
                      className={
                        (isSelected ? 'is-selected' : '') +
                        (isDragging ? ' is-dragging' : '') +
                        (isDropHere ? ' is-drop-target' : '')
                      }
                      onDragOver={(ev) => onDragOverCommand(catKey, index, ev)}
                      onDrop={(ev) => onDropCommand(catKey, index, ev)}
                    >
                      <span
                        className="command-editor-dialog__drag-handle"
                        draggable
                        title={t('command_drag_hint')}
                        aria-label={t('command_drag_hint')}
                        onDragStart={(ev) => onCommandDragStart(item.id, ev)}
                        onDragEnd={clearDrag}
                      >
                        ⋮⋮
                      </span>
                      <span
                        className="command-editor-dialog__command-label"
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          editor.setSelectedCategoryKey(catKey);
                          editor.setSelectedCommandId(item.id);
                        }}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter' || ev.key === ' ') {
                            ev.preventDefault();
                            editor.setSelectedCategoryKey(catKey);
                            editor.setSelectedCommandId(item.id);
                          }
                        }}
                      >
                        {item.name || item.id}
                      </span>
                    </li>
                  );
                })}
                {!commands.length && (
                  <li
                    className={
                      'command-editor-dialog__drop-empty' +
                      (dropTarget?.kind === 'command' &&
                      dropTarget.categoryKey === catKey &&
                      dropTarget.index === 0
                        ? ' is-drop-target'
                        : '')
                    }
                    onDragOver={(ev) => onDragOverCommand(catKey, 0, ev)}
                    onDrop={(ev) => onDropCommand(catKey, 0, ev)}
                  >
                    {t('command_drop_here')}
                  </li>
                )}
              </ul>
            </section>
          </Fragment>
        );
      })}
      <div
        className={
          'command-editor-dialog__cat-drop-slot command-editor-dialog__cat-drop-slot--end' +
          (dropTarget?.kind === 'category' && dropTarget.index === editor.categoryKeys.length
            ? ' is-drop-target'
            : '')
        }
        onDragOver={(ev) => onDragOverCategory(editor.categoryKeys.length, ev)}
        onDrop={(ev) => onDropCategory(editor.categoryKeys.length, ev)}
      />
    </div>
  );
}
