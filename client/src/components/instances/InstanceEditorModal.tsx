import { AppIcon } from '../AppIcon';
import type { AppIconName } from '../../lib/appIcons';
import { CancelButton } from '../CancelButton';
import { FccSwitch } from '../FccSwitch';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { InstanceEditorApi } from '../../hooks/useInstanceEditor';

interface InstanceEditorModalProps {
  editor: InstanceEditorApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

function InstanceEditorCardHeader({
  icon,
  title,
}: {
  icon?: AppIconName;
  title: string;
}) {
  return (
    <div className="instance-editor-card__header">
      {icon ? <AppIcon name={icon} size={16} className="instance-editor-card__header-icon" /> : null}
      <span className="instance-editor-card__title">{title}</span>
    </div>
  );
}

export function InstanceEditorModal({ editor, t }: InstanceEditorModalProps) {
  const { form, mode, setForm, hasFactorioCredentials } = editor;
  const isAdd = mode === 'add';
  const downloadDisabled = isAdd && !hasFactorioCredentials;

  return (
    <ModalBackdrop open={editor.open} id="instanceEditorBackdrop" onClose={editor.close}>
      <div
        className={
          'fu-modal instance-editor-modal' +
          (isAdd ? ' instance-editor-modal--add' : ' instance-editor-modal--edit')
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="instanceEditorHeading"
      >
        <div className="fu-modal__header instance-editor-modal__header" id="instanceEditorHeading">
          <AppIcon
            name={isAdd ? 'add' : 'edit'}
            size={20}
            className="instance-editor-modal__header-icon"
          />
          <span className="instance-editor-modal__header-title">
            {isAdd ? t('instances_add_dialog_title') : t('instances_edit_dialog_title')}
          </span>
        </div>
        <div className="fu-modal__body instance-editor-modal__body">
          <form
            id="instanceEditorForm"
            className="instance-editor-form"
            method="get"
            action="#"
            autoComplete="off"
            noValidate
            data-fcc-no-credentials="1"
            onSubmit={(e) => e.preventDefault()}
          >
            <div className="instance-editor-layout">
              <div className="instance-editor-main">
                <section className="instance-editor-card">
                  <InstanceEditorCardHeader icon="badge" title={t('instances_editor_section_general')} />
                  <div className="instance-editor-card__body">
                    <label className="instance-editor-field" htmlFor="instanceEditorName">
                      <span className="instance-editor-field__label">{t('instances_col_name')}</span>
                      <input
                        type="text"
                        id="instanceEditorName"
                        className="input instance-editor-field__input"
                        autoComplete="off"
                        spellCheck={false}
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      />
                    </label>
                  </div>
                </section>

                <section className="instance-editor-card instance-editor-card--toggles">
                  <InstanceEditorCardHeader icon="autostart" title={t('instances_editor_section_behavior')} />
                  <div className="instance-editor-card__body instance-editor-card__body--options">
                    <div className="instance-editor-option">
                      <FccSwitch
                        id="instanceEditorAutostart"
                        className="instance-editor-option__switch"
                        checked={form.autostartServer}
                        onChange={(checked) => setForm((f) => ({ ...f, autostartServer: checked }))}
                        label={t('program_autostart_server_cb')}
                      />
                      <span className="instance-editor-option__hint">{t('instances_autostart_help')}</span>
                    </div>
                    <div className="instance-editor-option">
                      <FccSwitch
                        id="instanceEditorAutoEnter"
                        className="instance-editor-option__switch"
                        checked={form.autoEnterPanel}
                        onChange={(checked) => setForm((f) => ({ ...f, autoEnterPanel: checked }))}
                        label={t('instances_auto_enter_cb')}
                      />
                      <span className="instance-editor-option__hint">{t('instances_auto_enter_help')}</span>
                    </div>
                    <div className="instance-editor-option">
                      <FccSwitch
                        id="instanceEditorBlockUpdates"
                        className="instance-editor-option__switch"
                        checked={form.blockUpdates}
                        onChange={(checked) => setForm((f) => ({ ...f, blockUpdates: checked }))}
                        label={t('instances_block_updates_cb')}
                      />
                      <span className="instance-editor-option__hint">{t('instances_block_updates_help')}</span>
                    </div>
                    <div className="instance-editor-option">
                      <FccSwitch
                        id="instanceEditorExperimentalUpdates"
                        className="instance-editor-option__switch"
                        checked={form.experimentalUpdates}
                        onChange={(checked) => setForm((f) => ({ ...f, experimentalUpdates: checked }))}
                        label={t('instances_experimental_updates_cb')}
                      />
                      <span className="instance-editor-option__hint">{t('instances_experimental_updates_help')}</span>
                    </div>
                  </div>
                </section>
              </div>

              <div className="instance-editor-side">
                <section className="instance-editor-card instance-editor-card--net">
                  <InstanceEditorCardHeader icon="lan" title={t('instances_editor_section_network')} />
                  <div className="instance-editor-card__body">
                    <div className="instance-editor-net-grid">
                      <div className="instance-editor-net-col">
                        <label className="instance-editor-field instance-editor-field--compact" htmlFor="instanceEditorIp">
                          <span className="instance-editor-field__label">{t('instances_server_ip_label')}</span>
                          <input
                            type="text"
                            id="instanceEditorIp"
                            className="input input--net-text instance-editor-field__input"
                            autoComplete="off"
                            spellCheck={false}
                            value={form.ip}
                            onChange={(e) => setForm((f) => ({ ...f, ip: e.target.value }))}
                          />
                        </label>
                        <label
                          className="instance-editor-field instance-editor-field--compact fcc-rcon-secret-field"
                          htmlFor="instanceEditorRconPassword"
                        >
                          <input
                            type="text"
                            className="fcc-credential-pair-break"
                            tabIndex={-1}
                            autoComplete="off"
                            aria-hidden="true"
                            value=""
                            readOnly
                          />
                          <span className="instance-editor-field__label">{t('instances_rcon_password_label')}</span>
                          <input
                            type="text"
                            id="instanceEditorRconPassword"
                            className="input input--net-text instance-editor-field__input"
                            autoComplete="off"
                            autoCapitalize="off"
                            autoCorrect="off"
                            spellCheck={false}
                            data-lpignore="true"
                            data-1p-ignore="true"
                            data-bwignore="true"
                            value={form.rconPassword}
                            onChange={(e) => setForm((f) => ({ ...f, rconPassword: e.target.value }))}
                          />
                        </label>
                      </div>
                      <div className="instance-editor-net-col">
                        <label className="instance-editor-field instance-editor-field--compact" htmlFor="instanceEditorPort">
                          <span className="instance-editor-field__label">{t('instances_col_server_port')}</span>
                          <input
                            type="number"
                            id="instanceEditorPort"
                            className="input input--port instance-editor-field__input"
                            min={1}
                            max={65535}
                            step={1}
                            inputMode="numeric"
                            autoComplete="off"
                            value={form.port}
                            onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
                          />
                        </label>
                        <label className="instance-editor-field instance-editor-field--compact" htmlFor="instanceEditorRconPort">
                          <span className="instance-editor-field__label">{t('instances_rcon_port_label')}</span>
                          <input
                            type="number"
                            id="instanceEditorRconPort"
                            className="input input--port instance-editor-field__input"
                            min={1}
                            max={65535}
                            step={1}
                            inputMode="numeric"
                            autoComplete="off"
                            value={form.rconPort}
                            onChange={(e) => setForm((f) => ({ ...f, rconPort: e.target.value }))}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="instance-editor-card instance-editor-card--path">
                  <InstanceEditorCardHeader icon="folder_open" title={t('instances_editor_section_path')} />
                  <div className="instance-editor-card__body">
                    <label className="instance-editor-field instance-editor-field--compact">
                      <span className="instance-editor-field__label">{t('instances_col_path')}</span>
                      <span className="instance-path-edit instance-editor-path-edit">
                        <input
                          type="text"
                          id="instanceEditorPath"
                          className="input instance-editor-field__input"
                          autoComplete="off"
                          spellCheck={false}
                          value={form.serverPath}
                          onChange={(e) => setForm((f) => ({ ...f, serverPath: e.target.value }))}
                        />
                        <button
                          type="button"
                          className="btn btn--compact btn--with-icon instance-editor-path-edit__btn"
                          id="btnInstancePathBrowse"
                          onClick={editor.openPathBrowser}
                        >
                          <AppIcon name="folder_open" size={16} />
                          {t('instances_path_browse_btn')}
                        </button>
                      </span>
                      <span className="instance-editor-field__hint">{t('instances_server_path_help')}</span>
                    </label>
                  </div>
                </section>

                {isAdd ? (
                  <section
                    className={
                      'instance-editor-card instance-editor-card--download' +
                      (downloadDisabled ? ' instance-editor-card--download-disabled' : '')
                    }
                  >
                    <InstanceEditorCardHeader icon="download" title={t('instances_editor_section_download')} />
                    <div className="instance-editor-card__body instance-editor-card__body--download">
                      <div className="instance-editor-option">
                        <FccSwitch
                          id="instanceEditorDownloadPackage"
                          className="instance-editor-option__switch"
                          checked={form.downloadServerPackage}
                          disabled={downloadDisabled}
                          title={downloadDisabled ? t('instances_error_no_credentials') : undefined}
                          onChange={(checked) => setForm((f) => ({ ...f, downloadServerPackage: checked }))}
                          label={t('instances_download_package_cb')}
                        />
                        <span className="instance-editor-option__hint">{t('instances_download_package_help')}</span>
                      </div>
                      {downloadDisabled ? (
                        <p className="instance-editor-download-note">{t('instances_error_no_credentials')}</p>
                      ) : null}
                      <div
                        id="instanceEditorDownloadOptions"
                        className={
                          'instance-editor-download-collapse' +
                          (editor.downloadOptionsExpanded ? ' is-expanded' : '')
                        }
                        aria-hidden={editor.downloadOptionsExpanded ? 'false' : 'true'}
                      >
                        <div
                          className="instance-editor-download-collapse__inner"
                          {...(!editor.downloadOptionsExpanded ? { inert: true as const } : {})}
                        >
                          <div className="instance-editor-download-group">
                            {editor.showPackageBuild ? (
                              <label
                                id="instanceEditorPackageBuildWrap"
                                className="instance-editor-download-row"
                                htmlFor="instanceEditorPackageBuild"
                              >
                                <span className="instance-editor-download-row__label">
                                  {t('instances_download_build_label')}
                                </span>
                                <select
                                  id="instanceEditorPackageBuild"
                                  className="input instance-editor-download-row__input"
                                  value={form.packageBuild}
                                  onChange={(e) => setForm((f) => ({ ...f, packageBuild: e.target.value }))}
                                >
                                  <option value="alpha">{t('instances_download_build_alpha')}</option>
                                  <option value="expansion">{t('instances_download_build_expansion')}</option>
                                </select>
                              </label>
                            ) : null}
                            <label className="instance-editor-download-row" htmlFor="instanceEditorPackageVersion">
                              <span className="instance-editor-download-row__label">
                                {t('instances_download_version_label')}
                              </span>
                              <select
                                id="instanceEditorPackageVersion"
                                className="input instance-editor-download-row__input"
                                value={form.packageVersion}
                                onChange={(e) => setForm((f) => ({ ...f, packageVersion: e.target.value }))}
                              >
                                {editor.versionOptions.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <div className="instance-editor-download-row instance-editor-download-row--switch">
                              <FccSwitch
                                id="instanceEditorShowExperimental"
                                className="instance-editor-download-row__switch"
                                checked={form.showExperimental}
                                onChange={(checked) => setForm((f) => ({ ...f, showExperimental: checked }))}
                                label={t('instances_download_show_experimental')}
                              />
                            </div>
                            {editor.showCustomVersion ? (
                              <label
                                id="instanceEditorPackageVersionCustomWrap"
                                className="instance-editor-download-row"
                                htmlFor="instanceEditorPackageVersionCustom"
                              >
                                <span className="instance-editor-download-row__label">
                                  {t('instances_download_version_custom_label')}
                                </span>
                                <input
                                  type="text"
                                  id="instanceEditorPackageVersionCustom"
                                  className="input instance-editor-download-row__input"
                                  placeholder="2.0.61"
                                  autoComplete="off"
                                  spellCheck={false}
                                  value={form.packageVersionCustom}
                                  onChange={(e) => setForm((f) => ({ ...f, packageVersionCustom: e.target.value }))}
                                />
                              </label>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          </form>
        </div>
        <div className="fu-modal__footer instance-editor-modal__footer">
          <CancelButton
            id="btnInstanceEditorCancel"
            onClick={editor.close}
            disabled={editor.saving}
            t={t}
          />
          <button
            type="button"
            className="btn btn--primary btn--with-icon"
            id="btnInstanceEditorSave"
            disabled={editor.saving}
            onClick={() => void editor.save()}
          >
            <AppIcon name={isAdd ? 'add' : 'save'} size={16} />
            {isAdd ? t('instances_add_btn') : t('save_btn')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
