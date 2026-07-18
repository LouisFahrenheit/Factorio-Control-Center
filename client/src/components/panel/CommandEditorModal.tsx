import { AppIcon } from '../AppIcon';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import { CommandItemsEditorModal } from './CommandItemsEditorModal';
import { CommandEditorNav } from './CommandEditorNav';
import type { CommandEditorApi } from '../../hooks/useCommandEditor';

interface CommandEditorModalProps {
  editor: CommandEditorApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function CommandEditorModal({ editor, t }: CommandEditorModalProps) {
  const cmd = editor.selectedCommand;
  const editorDisabled = !cmd;
  const itemCount = cmd?.items ? Object.keys(cmd.items).length : 0;

  return (
    <>
      <ModalBackdrop open={editor.open} id="commandEditorBackdrop" onClose={editor.closeDialog}>
        <div
          className="fu-modal command-editor-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="commandEditorHeading"
        >
          <div className="fu-modal__header fu-modal__header--with-icon" id="commandEditorHeading">
            <AppIcon name="edit_document" size={20} />
            {t('commands_title')}
          </div>
          <div className="fu-modal__body">
            <div className="command-editor-dialog__toolbar">
              <button type="button" className="btn" onClick={editor.addCategory}>
                {t('add_category')}
              </button>
              <button
                type="button"
                className="btn btn--danger btn--with-icon"
                disabled={!editor.selectedCategoryKey}
                onClick={editor.deleteCategory}
              >
                <AppIcon name="delete" size={16} />
                {t('delete_category')}
              </button>
              <span className="command-editor-dialog__toolbar-sep" aria-hidden="true" />
              <button type="button" className="btn" onClick={editor.addCommand}>
                {t('add_command')}
              </button>
              <button
                type="button"
                className="btn btn--danger btn--with-icon"
                disabled={!editor.selectedCommandId}
                onClick={editor.deleteCommand}
              >
                <AppIcon name="delete" size={16} />
                {t('delete_command')}
              </button>
            </div>
            <div className="command-editor-dialog__layout">
              <aside className="command-editor-dialog__nav">
                <CommandEditorNav editor={editor} t={t} />
              </aside>
              <div className="command-editor-dialog__editor">
                <h4 className="panel__title panel__title--sub">{t('command_editor_title')}</h4>
                <label className="command-editor-dialog__field">
                  <span>{t('command_name')}</span>
                  <input
                    type="text"
                    className="input"
                    disabled={editorDisabled}
                    value={cmd?.name || ''}
                    onChange={(e) => editor.setCommandField({ name: e.target.value })}
                  />
                </label>
                <label className="command-editor-dialog__field">
                  <span>{t('command_category')}</span>
                  <select
                    className="input"
                    disabled={editorDisabled}
                    value={editor.selectedCategoryKey}
                    onChange={(e) => editor.moveCommandToCategory(e.target.value)}
                  >
                    {editor.categoryKeys.map((key) => (
                      <option key={key} value={key}>
                        {editor.catalog.categories[key]?.name || key}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="command-editor-dialog__field">
                  <span>{t('command_text')}</span>
                  <textarea
                    className="settings-json command-editor-dialog__command-text"
                    spellCheck={false}
                    disabled={editorDisabled}
                    value={cmd?.command || ''}
                    onChange={(e) => editor.setCommandField({ command: e.target.value })}
                  />
                </label>
                <label className="command-editor-dialog__field">
                  <span>{t('command_description')}</span>
                  <textarea
                    className="command-editor-dialog__description"
                    spellCheck
                    disabled={editorDisabled}
                    value={cmd?.description || ''}
                    onChange={(e) => editor.setCommandField({ description: e.target.value })}
                  />
                </label>
                <fieldset className="command-editor-dialog__params" disabled={editorDisabled}>
                  <legend>{t('parameters')}</legend>
                  <label className="command-editor-dialog__check">
                    <input
                      type="checkbox"
                      checked={!!cmd?.has_player}
                      onChange={(e) => editor.toggleFlag('has_player', e.target.checked)}
                    />
                    <span>{t('has_player')}</span>
                  </label>
                  <label className="command-editor-dialog__check">
                    <input
                      type="checkbox"
                      checked={!!cmd?.has_value}
                      onChange={(e) => editor.toggleFlag('has_value', e.target.checked)}
                    />
                    <span>{t('has_value')}</span>
                  </label>
                  <label className="command-editor-dialog__check">
                    <input
                      type="checkbox"
                      checked={!!cmd?.has_boolean}
                      onChange={(e) => editor.toggleFlag('has_boolean', e.target.checked)}
                    />
                    <span>{t('has_boolean')}</span>
                  </label>
                  <label className="command-editor-dialog__check">
                    <input
                      type="checkbox"
                      checked={!!cmd?.has_item}
                      onChange={(e) => editor.toggleFlag('has_item', e.target.checked)}
                    />
                    <span>{t('has_item')}</span>
                  </label>
                  <label className="command-editor-dialog__check">
                    <input
                      type="checkbox"
                      checked={!!cmd?.has_count}
                      onChange={(e) => editor.toggleFlag('has_count', e.target.checked)}
                    />
                    <span>{t('has_count')}</span>
                  </label>
                  <label className="command-editor-dialog__check">
                    <input
                      type="checkbox"
                      checked={!!cmd?.has_quality}
                      onChange={(e) => editor.toggleFlag('has_quality', e.target.checked)}
                    />
                    <span>{t('has_quality')}</span>
                  </label>
                </fieldset>
                {(cmd?.has_value || cmd?.has_boolean) && (
                  <label className="command-editor-dialog__field">
                    <span>{t('default_value')}</span>
                    {cmd?.has_boolean ? (
                      <select
                        className="input input--narrow"
                        disabled={editorDisabled}
                        value={cmd.default_value || 'true'}
                        onChange={(e) => editor.setCommandField({ default_value: e.target.value })}
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : (
                      <input
                        className="input"
                        disabled={editorDisabled}
                        value={cmd?.default_value || ''}
                        onChange={(e) => editor.setCommandField({ default_value: e.target.value })}
                      />
                    )}
                  </label>
                )}
                {cmd?.has_item && (
                  <div className="command-editor-dialog__items">
                    <p className="hint">
                      {itemCount
                        ? t('items_editor_items_configured', itemCount)
                        : t('items_editor_no_items')}
                    </p>
                    <button
                      type="button"
                      className="btn btn--with-icon"
                      disabled={editorDisabled}
                      onClick={() => editor.setItemsEditorOpen(true)}
                    >
                      <AppIcon name="edit_document" size={16} />
                      {t('items_editor_edit_list_btn')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="fu-modal__footer">
            <button type="button" className="btn btn--with-icon" onClick={editor.closeDialog}>
              <AppIcon name="close" size={16} />
              {t('close')}
            </button>
          </div>
        </div>
      </ModalBackdrop>
      <CommandItemsEditorModal editor={editor} t={t} />
    </>
  );
}
