import { useCallback, useEffect, useMemo, useState } from 'react';
import { modals } from '@mantine/modals';
import {
  IconDeviceFloppy,
  IconEraser,
  IconListDetails,
  IconPlus,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { SearchField } from '../SearchField';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import { feedbackMsg } from '../../lib/apiFeedback';
import type { CommandEditorApi } from '../../hooks/useCommandEditor';

interface CommandItemsEditorModalProps {
  editor: CommandEditorApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function CommandItemsEditorModal({
  editor,
  t,
}: CommandItemsEditorModalProps) {
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemCount, setItemCount] = useState('1');

  const items = useMemo(
    () => editor.selectedCommand?.items || {},
    [editor.selectedCommand?.items],
  );
  const itemKeys = useMemo(
    () => Object.keys(items).sort((a, b) => a.localeCompare(b)),
    [items],
  );

  const isFormDirty =
    !!selectedItem || !!itemName || (itemCount !== '' && itemCount !== '1');

  const filteredKeys = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return itemKeys;
    return itemKeys.filter((k) => k.toLowerCase().includes(q));
  }, [itemKeys, search]);

  function selectItem(name: string) {
    setSelectedItem(name);
    setItemName(name);
    setItemCount(String(items[name] ?? 1));
  }

  const resetForm = useCallback(() => {
    setSelectedItem('');
    setItemName('');
    setItemCount('1');
  }, []);

  useEffect(() => {
    resetForm();
    setSearch('');
    setItemCount('1');
  }, [editor.itemsEditorOpen, editor.selectedCommandId, resetForm]);

  function upsertItem() {
    const name = itemName.trim();
    if (!name) {
      feedbackMsg(
        t('items_editor_error_title'),
        t('items_editor_error_item_name'),
        true,
        false,
        t,
      );
      return;
    }
    const count = Math.max(1, parseInt(itemCount, 10) || 1);
    const next = { ...items, [name]: count };
    editor.setCommandItems(next);
    setSelectedItem(name);
  }

  function deleteItem() {
    if (!selectedItem) return;
    modals.openConfirmModal({
      title: t('items_editor_confirm_delete'),
      children: t('items_editor_confirm_delete_msg', selectedItem),
      labels: { confirm: t('items_editor_delete'), cancel: t('cancel') },
      confirmProps: { className: 'btn btn--danger' },
      onConfirm: () => {
        const next = { ...items };
        delete next[selectedItem];
        editor.setCommandItems(next);
        resetForm();
      },
    });
  }

  return (
    <ModalBackdrop
      open={editor.itemsEditorOpen}
      id="commandItemsEditorBackdrop"
      onClose={() => editor.setItemsEditorOpen(false)}
      backdropClassName="fu-modal-backdrop--stacked"
    >
      <div
        className="fu-modal command-items-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="commandItemsEditorHeading"
      >
        <div
          className="fu-modal__header fu-modal__header--with-icon"
          id="commandItemsEditorHeading"
        >
          <span className="fu-modal__header-icon">
            <IconListDetails size={20} />
          </span>
          <span>{t('items_editor_title')}</span>
        </div>
        <div className="fu-modal__body">
          <div className="command-items-editor__layout">
            <div className="command-items-editor__list-panel">
              <div className="command-items-editor__section-header">
                <span className="command-items-editor__section-title">
                  {t('command_items')}
                </span>
                <span
                  className="command-items-editor__badge"
                  title={t('items_editor_items_configured', itemKeys.length)}
                >
                  {itemKeys.length}
                </span>
              </div>

              <div className="command-items-editor__search-wrap">
                <SearchField
                  type="text"
                  placeholder={t('search_placeholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <ul className="command-items-editor__list">
                {filteredKeys.map((name) => (
                  <li
                    key={name}
                    className={`command-items-editor__item${name === selectedItem ? ' is-selected' : ''}`}
                    onClick={() => selectItem(name)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        selectItem(name);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <span className="command-items-editor__item-name">
                      {name}
                    </span>
                    <span className="command-items-editor__count-badge">
                      {items[name]}
                    </span>
                  </li>
                ))}
                {!filteredKeys.length && (
                  <li className="command-items-editor__empty">
                    {itemKeys.length === 0
                      ? t('items_editor_no_items')
                      : t('items_editor_search_no_results')}
                  </li>
                )}
              </ul>
            </div>

            <div className="command-items-editor__form">
              <div className="command-items-editor__section-header">
                <span className="command-items-editor__section-title">
                  {t('items_editor_add_edit_group')}
                </span>
                {isFormDirty && (
                  <button
                    type="button"
                    className="btn btn--secondary"
                    style={{
                      padding: 0,
                      width: 24,
                      height: 24,
                      minHeight: 24,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title={t('clear')}
                    aria-label={t('clear')}
                    onClick={resetForm}
                  >
                    <IconEraser size={14} />
                  </button>
                )}
              </div>

              <label className="command-items-editor__field">
                <span className="command-items-editor__field-label">
                  {t('items_editor_item_name')}
                </span>
                <input
                  type="text"
                  className="input"
                  placeholder={t('items_editor_item_name_placeholder')}
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                />
              </label>

              <label className="command-items-editor__field">
                <span className="command-items-editor__field-label">
                  {t('items_editor_max_count_label')}
                </span>
                <input
                  type="number"
                  className="input"
                  min={1}
                  placeholder={t('items_editor_max_count_placeholder')}
                  value={itemCount}
                  onChange={(e) => setItemCount(e.target.value)}
                />
              </label>

              <div className="command-items-editor__actions">
                <button
                  type="button"
                  className="btn btn--primary btn--with-icon"
                  onClick={upsertItem}
                >
                  {selectedItem ? (
                    <IconDeviceFloppy size={16} />
                  ) : (
                    <IconPlus size={16} />
                  )}
                  {t('items_editor_add_update')}
                </button>
                <button
                  type="button"
                  className="btn btn--danger btn--with-icon"
                  disabled={!selectedItem}
                  onClick={deleteItem}
                >
                  <IconTrash size={16} />
                  {t('items_editor_delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="fu-modal__footer">
          <button
            type="button"
            className="btn btn--with-icon"
            onClick={() => editor.setItemsEditorOpen(false)}
          >
            <IconX size={16} />
            {t('close')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
