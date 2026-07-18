import { useEffect, useRef } from 'react';
import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { InstanceEditorApi } from '../../hooks/useInstanceEditor';

interface InstancePathBrowserModalProps {
  editor: InstanceEditorApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function InstancePathBrowserModal({ editor, t }: InstancePathBrowserModalProps) {
  const createInputRef = useRef<HTMLInputElement>(null);
  const currentLabel = editor.pathBrowseCurrent || t('instances_path_locations');
  const currentIcon =
    editor.pathBrowseFactorioOk === true
      ? 'folder_check'
      : editor.pathBrowseCurrent
        ? 'folder_open'
        : 'folder';

  useEffect(() => {
    if (!editor.pathBrowseCreateOpen) return;
    const id = window.requestAnimationFrame(() => {
      createInputRef.current?.focus();
      createInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [editor.pathBrowseCreateOpen]);

  return (
    <ModalBackdrop open={editor.pathBrowserOpen} id="instancePathBrowseBackdrop" onClose={editor.closePathBrowser}>
      <div
        className="fu-modal instance-path-browse-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="instancePathBrowseHeading"
      >
        <div className="fu-modal__header instance-path-browse-dialog__header" id="instancePathBrowseHeading">
          <span className="instance-path-browse-dialog__header-title">{t('instances_path_browser_title')}</span>
        </div>
        <div className="fu-modal__body instance-path-browse-dialog__body">
          <div className="instance-path-browse-toolbar">
            <button
              type="button"
              className="btn btn--compact btn--with-icon"
              id="btnInstancePathUp"
              disabled={!editor.pathBrowseParent || editor.pathBrowseCreateOpen}
              onClick={editor.pathBrowseUp}
            >
              <AppIcon name="arrow_upward" size={16} />
              {t('instances_path_up_btn')}
            </button>
            <button
              type="button"
              className="btn btn--compact btn--with-icon"
              id="btnInstancePathRoot"
              disabled={editor.pathBrowseCreateOpen}
              onClick={editor.pathBrowseRoot}
            >
              <AppIcon name="folder" size={16} />
              {t('instances_path_disks_btn')}
            </button>
          </div>

          <div
            id="instancePathCurrent"
            className={
              'instance-path-browse-current' +
              (editor.pathBrowseFactorioOk === true ? ' instance-path-browse-current--factorio' : '')
            }
          >
            <AppIcon name={currentIcon} size={18} className="instance-path-browse-current__icon" />
            <span className="instance-path-browse-current__path">{currentLabel}</span>
            {editor.pathBrowseFactorioOk === true ? (
              <span className="instance-path-browse-current__badge">{t('instances_path_factorio_ok')}</span>
            ) : null}
          </div>

          <div
            id="instancePathBrowseList"
            className={
              'instance-path-browse-list' + (editor.pathBrowseCreateOpen ? ' instance-path-browse-list--dimmed' : '')
            }
          >
            {editor.pathBrowseLoading ? (
              <div className="instance-path-browse-empty">
                <AppIcon name="folder" size={28} className="instance-path-browse-empty__icon" />
                <span>…</span>
              </div>
            ) : !editor.pathBrowseItems.length ? (
              <div className="instance-path-browse-empty">
                <AppIcon name="folder_open" size={28} className="instance-path-browse-empty__icon" />
                <span>{t('instances_path_empty')}</span>
              </div>
            ) : (
              editor.pathBrowseItems.map((it, idx) => {
                const path = String(it.path || '');
                const name = String(it.name || path);
                if (!path) return null;
                return (
                  <button
                    key={path + idx}
                    type="button"
                    className="instance-path-browse-item"
                    disabled={editor.pathBrowseCreateOpen}
                    onClick={() => editor.pathBrowseEnter(path)}
                  >
                    <AppIcon name="folder" size={18} className="instance-path-browse-item__icon" />
                    <span className="instance-path-browse-item__label">{name || path}</span>
                  </button>
                );
              })
            )}
          </div>

          {editor.pathBrowseCreateOpen ? (
            <div className="instance-path-browse-create" role="form" aria-labelledby="instancePathCreateLabel">
              <label className="instance-path-browse-create__label" id="instancePathCreateLabel" htmlFor="instancePathCreateName">
                <AppIcon name="create_new_folder" size={18} className="instance-path-browse-create__label-icon" />
                {t('instances_path_create_prompt')}
              </label>
              <input
                ref={createInputRef}
                type="text"
                id="instancePathCreateName"
                className="input instance-path-browse-create__input"
                autoComplete="off"
                disabled={editor.pathBrowseCreateSaving}
                value={editor.pathBrowseCreateName}
                onChange={(e) => editor.setPathBrowseCreateName(e.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') {
                    ev.preventDefault();
                    void editor.submitPathBrowseCreate();
                  }
                  if (ev.key === 'Escape') {
                    ev.preventDefault();
                    editor.closePathBrowseCreate();
                  }
                }}
              />
              {editor.pathBrowseCreateError ? (
                <p className="instance-path-browse-create__error" role="alert">
                  {editor.pathBrowseCreateError}
                </p>
              ) : null}
              <div className="instance-path-browse-create__actions">
                <button
                  type="button"
                  className="btn btn--with-icon"
                  id="btnInstancePathCreateCancel"
                  disabled={editor.pathBrowseCreateSaving}
                  onClick={editor.closePathBrowseCreate}
                >
                  <AppIcon name="close" size={16} />
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  className="btn btn--with-icon btn--primary"
                  id="btnInstancePathCreateConfirm"
                  disabled={editor.pathBrowseCreateSaving}
                  onClick={() => void editor.submitPathBrowseCreate()}
                >
                  <AppIcon name="create_new_folder" size={16} />
                  {t('instances_path_create_btn')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <div className="fu-modal__footer instance-path-browse-dialog__footer">
          <button
            type="button"
            className="btn btn--with-icon"
            id="btnInstancePathCreate"
            disabled={!editor.pathBrowseCurrent || editor.pathBrowseCreateOpen}
            onClick={editor.openPathBrowseCreate}
          >
            <AppIcon name="create_new_folder" size={16} />
            {t('instances_path_create_btn')}
          </button>
          <span className="instance-path-browse-dialog__footer-spacer" aria-hidden="true" />
          <CancelButton id="btnInstancePathBrowseCancel" onClick={editor.closePathBrowser} t={t} />
          <button
            type="button"
            className="btn btn--with-icon btn--primary"
            id="btnInstancePathBrowseSelect"
            disabled={!editor.pathBrowseCurrent || editor.pathBrowseCreateOpen}
            onClick={editor.pathBrowseSelect}
          >
            <AppIcon name="folder_check" size={16} />
            {t('instances_path_select_btn')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
