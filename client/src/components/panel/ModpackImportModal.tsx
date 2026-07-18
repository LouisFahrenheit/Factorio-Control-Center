import { CancelButton } from '../CancelButton';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { ModpacksApi } from '../../hooks/useModpacks';

interface ModpackImportModalProps {
  modpacks: ModpacksApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function ModpackImportModal({ modpacks, t }: ModpackImportModalProps) {
  const st = modpacks.importState;
  if (!modpacks.importOpen || !st) return null;

  const desc = String(st.payload.description || '').trim();
  const allMods = Array.isArray(st.payload.mods) ? st.payload.mods : [];

  return (
    <ModalBackdrop open id="modpackImportBackdrop" onClose={modpacks.closeImportDialog}>
      <div className="fu-modal modpack-import-dialog" role="dialog" aria-modal="true" aria-labelledby="modpackImportDlgHeading">
        <div className="fu-modal__header" id="modpackImportDlgHeading">
          {t('modpack_import_dialog_title')}
        </div>
        <div className="fu-modal__body">
          <dl className="modpack-import-dialog__info">
            <dt>{t('modpack_import_dialog_pack_label')}</dt>
            <dd id="modpackImportDlgName">{String(st.payload.name || '') || '—'}</dd>
            <dt>{t('modpack_import_dialog_mods_count_label')}</dt>
            <dd id="modpackImportDlgModsCount">{String(st.userMods?.length ?? 0)}</dd>
            <dt>{t('modpack_import_dialog_has_settings_label')}</dt>
            <dd id="modpackImportDlgHasSettings">
              {st.hasSettings ? t('modpack_import_dialog_has_settings_yes') : t('modpack_import_dialog_has_settings_no')}
            </dd>
            <dt>{t('modpack_import_dialog_factorio_version_label')}</dt>
            <dd id="modpackImportDlgFactorio">{st.factorioLabel || '—'}</dd>
          </dl>
          {desc && (
            <p id="modpackImportDlgDesc" className="modpack-import-dialog__desc">
              {desc}
            </p>
          )}
          <p className="modpack-import-dialog__desc">{t('modpack_import_dialog_latest_versions_hint')}</p>
          <ul id="modpackImportDlgMods" className="modpack-import-dialog__mods" aria-live="polite">
            {allMods.map((m) => {
              const nm = String(m?.name || '').trim();
              if (!nm) return null;
              const enabled = m?.enabled !== false;
              const ver = String(m?.version || '?');
              return (
                <li key={nm} className={enabled ? undefined : 'is-disabled'}>
                  {(enabled ? '✓' : '·') + '  ' + nm + '   v' + ver}
                </li>
              );
            })}
          </ul>
          <label className="modpack-import-dialog__field" htmlFor="modpackImportDlgTarget">
            <span>{t('modpack_import_dialog_target_label')}</span>
            <input
              type="text"
              id="modpackImportDlgTarget"
              className="input"
              maxLength={80}
              autoComplete="off"
              spellCheck={false}
              value={modpacks.importTargetName}
              onChange={(e) => modpacks.setImportTargetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void modpacks.submitImport();
                }
              }}
            />
          </label>
          <label className="modpack-import-dialog__option">
            <input
              type="checkbox"
              id="modpackImportDlgApplySettings"
              disabled={!st.hasSettings}
              checked={modpacks.importApplySettings}
              onChange={(e) => modpacks.setImportApplySettings(e.target.checked)}
            />
            <span>{t('modpack_import_dialog_apply_settings_cb')}</span>
          </label>
          <p id="modpackImportDlgError" className="modpack-import-dialog__error" aria-live="polite">
            {modpacks.importError}
          </p>
        </div>
        <div className="fu-modal__footer">
          <CancelButton id="modpackImportDlgCancel" onClick={modpacks.closeImportDialog} t={t} />
          <button
            type="button"
            className="btn btn--primary"
            id="modpackImportDlgOk"
            disabled={modpacks.importSubmitting}
            onClick={() => void modpacks.submitImport()}
          >
            {t('modpack_import_confirm_btn')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
