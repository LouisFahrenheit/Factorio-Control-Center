import { useEffect, useRef } from 'react';
import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { ModpacksApi } from '../../hooks/useModpacks';

interface ModpackSaveModalProps {
  modpacks: ModpacksApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function ModpackSaveModal({ modpacks, t }: ModpackSaveModalProps) {
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!modpacks.saveOpen || modpacks.saveSubmitting) return;
    const id = window.setTimeout(() => nameInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [modpacks.saveOpen, modpacks.saveSubmitting]);

  if (!modpacks.saveOpen) return null;

  return (
    <ModalBackdrop open id="modpackSaveBackdrop" onClose={modpacks.closeSaveDialog}>
      <div
        className="fu-modal modpack-import-dialog modpack-form-dialog modpack-save-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modpackSaveDlgHeading"
        aria-busy={modpacks.saveSubmitting}
      >
        <div className="fu-modal__header modpack-form-dialog__header" id="modpackSaveDlgHeading">
          <AppIcon name="save" size={18} className="modpack-form-dialog__header-icon" />
          <span>{t('modpack_save_dialog_title')}</span>
        </div>
        <div className="fu-modal__body modpack-form-dialog__body">
          <p className="modpack-form-dialog__hint">{t('modpack_save_dialog_hint')}</p>
          <div className="modpack-form-dialog__stats">
            <div className="modpack-form-dialog__stat">
              <span className="modpack-form-dialog__stat-label">
                {t('modpack_import_dialog_mods_count_label')}
              </span>
              <span className="modpack-form-dialog__stat-value" id="modpackSaveDlgModsCount">
                {String(modpacks.saveModsCount)}
              </span>
            </div>
            <div className="modpack-form-dialog__stat">
              <span className="modpack-form-dialog__stat-label">
                {t('modpack_import_dialog_factorio_version_label')}
              </span>
              <span className="modpack-form-dialog__stat-value" id="modpackSaveDlgFactorio">
                {modpacks.saveFactorioLabel}
              </span>
            </div>
          </div>
          <div className="modpack-form-dialog__mods-section">
            <span className="modpack-form-dialog__mods-label">{t('modpack_save_dialog_mods_label')}</span>
            <ul id="modpackSaveDlgMods" className="modpack-import-dialog__mods" aria-live="polite">
              {modpacks.saveMods.map((m) => {
                const label = String(m.display_name || m.name).trim() || m.name;
                return (
                  <li key={m.name} className={m.enabled ? undefined : 'is-disabled'}>
                    {(m.enabled ? '✓' : '·') + '  ' + label + '   v' + m.version}
                  </li>
                );
              })}
            </ul>
          </div>
          <label className="modpack-form-dialog__field-card" htmlFor="modpackSaveDlgName">
            <span className="modpack-form-dialog__field-label">{t('modpack_save_dialog_name_label')}</span>
            <input
              ref={nameInputRef}
              type="text"
              id="modpackSaveDlgName"
              className="input"
              maxLength={80}
              autoComplete="off"
              spellCheck={false}
              value={modpacks.saveName}
              disabled={modpacks.saveSubmitting}
              onChange={(e) => modpacks.setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void modpacks.submitSave();
                }
              }}
            />
          </label>
          <label className="modpack-form-dialog__field-card" htmlFor="modpackSaveDlgDesc">
            <span className="modpack-form-dialog__field-label">{t('modpack_save_dialog_description_label')}</span>
            <input
              type="text"
              id="modpackSaveDlgDesc"
              className="input"
              maxLength={240}
              autoComplete="off"
              spellCheck={false}
              value={modpacks.saveDesc}
              disabled={modpacks.saveSubmitting}
              onChange={(e) => modpacks.setSaveDesc(e.target.value)}
            />
          </label>
          <div className="modpack-form-dialog__options">
            <label className="modpack-form-dialog__option-card" htmlFor="modpackSaveDlgIncludeDisabled">
              <input
                type="checkbox"
                id="modpackSaveDlgIncludeDisabled"
                checked={modpacks.saveIncludeDisabled}
                disabled={modpacks.saveSubmitting}
                onChange={(e) => modpacks.setSaveIncludeDisabled(e.target.checked)}
              />
              <span>{t('modpack_save_dialog_include_disabled_cb')}</span>
            </label>
            <label className="modpack-form-dialog__option-card" htmlFor="modpackSaveDlgIncludeSettings">
              <input
                type="checkbox"
                id="modpackSaveDlgIncludeSettings"
                checked={modpacks.saveIncludeSettings}
                disabled={modpacks.saveSubmitting}
                onChange={(e) => modpacks.setSaveIncludeSettings(e.target.checked)}
              />
              <span>{t('modpack_save_dialog_include_settings_cb')}</span>
            </label>
          </div>
          <p id="modpackSaveDlgError" className="modpack-import-dialog__error" aria-live="polite">
            {modpacks.saveError}
          </p>
        </div>
        <div className="fu-modal__footer modpack-form-dialog__footer">
          <CancelButton
            id="modpackSaveDlgCancel"
            disabled={modpacks.saveSubmitting}
            onClick={modpacks.closeSaveDialog}
            t={t}
          />
          <button
            type="button"
            className="btn btn--primary btn--with-icon"
            id="modpackSaveDlgOk"
            disabled={modpacks.saveSubmitting || modpacks.saveModsCount <= 0}
            onClick={() => void modpacks.submitSave()}
          >
            <AppIcon name="save" size={16} />
            {t('save_btn')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
