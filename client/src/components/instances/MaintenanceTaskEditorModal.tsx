import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { FccSwitch } from '../FccSwitch';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { MaintenanceModsGameVersionPolicy } from '../../types/maintenance';
import type { MaintenanceTaskEditorApi } from '../../hooks/useMaintenanceTaskEditor';

import type { AppIconName } from '../../lib/appIcons';

interface MaintenanceTaskEditorModalProps {
  editor: MaintenanceTaskEditorApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const MODS_GAME_VERSION_POLICIES: { value: MaintenanceModsGameVersionPolicy; labelKey: string }[] = [
  { value: 'cancel', labelKey: 'maintenance_opt_mods_game_version_cancel' },
  { value: 'skip', labelKey: 'maintenance_opt_mods_game_version_skip' },
  { value: 'force', labelKey: 'maintenance_opt_mods_game_version_force' },
];

function EditorCardHeader({ icon, title }: { icon: AppIconName; title: string }) {
  return (
    <div className="maintenance-editor-card__header">
      <AppIcon name={icon} size={16} className="maintenance-editor-card__header-icon" />
      <span className="maintenance-editor-card__title">{title}</span>
    </div>
  );
}

export function MaintenanceTaskEditorModal({ editor, t }: MaintenanceTaskEditorModalProps) {
  const { form, scheduleDisabled, repeatDisabled, optsDisabled } = editor;

  return (
    <ModalBackdrop open={editor.open} id="maintenanceTaskEditorBackdrop" onClose={editor.close}>
      <div
        className="fu-modal maintenance-task-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="maintEditorTitle"
      >
        <div className="fu-modal__header maintenance-task-editor-modal__header" id="maintEditorTitle">
          <AppIcon name="maintenance" size={20} className="maintenance-task-editor-modal__header-icon" />
          <span className="maintenance-task-editor-modal__header-title">{t('maintenance_editor_title')}</span>
        </div>
        <div className="fu-modal__body maintenance-task-editor-modal__body">
          <input type="hidden" id="maintEditTaskId" value={form.taskId} readOnly />

          <div className="maintenance-task-editor-layout">
            <div className="maintenance-task-editor-layout__side">
              <section className="maintenance-editor-card">
                <EditorCardHeader icon="list" title={t('maintenance_editor_instance_label')} />
                <div className="maintenance-editor-card__body">
                  <div className="maintenance-editor-instance-summary-row">
                    <div id="maintEditInstanceSummary" className="maintenance-editor-instance-summary">
                      {editor.instanceSummary}
                    </div>
                    <button
                      type="button"
                      className="btn btn--compact btn--with-icon"
                      id="btnMaintEditPickInstances"
                      onClick={editor.openPicker}
                    >
                      <AppIcon name="folder_open" size={16} />
                      {t('maintenance_editor_pick_instances_btn')}
                    </button>
                  </div>
                </div>
              </section>

              <section className="maintenance-editor-card">
                <EditorCardHeader icon="settings" title={t('maintenance_options_stopped')} />
                <div className="maintenance-editor-card__body maintenance-editor-card__body--options">
                  <div className="maintenance-editor-option">
                    <FccSwitch
                      id="maintEditOptFactorio"
                      className="maintenance-editor-option__switch"
                      checked={form.optFactorio}
                      disabled={optsDisabled}
                      onChange={(checked) => editor.updateForm({ optFactorio: checked })}
                      label={t('maintenance_opt_update_factorio')}
                    />
                  </div>
                  <div className="maintenance-editor-option">
                    <FccSwitch
                      id="maintEditOptMods"
                      className="maintenance-editor-option__switch"
                      checked={form.optMods}
                      disabled={optsDisabled}
                      onChange={(checked) => editor.updateForm({ optMods: checked })}
                      label={t('maintenance_opt_update_mods')}
                    />
                  </div>
                  {form.optMods && !form.optFactorio && !optsDisabled ? (
                    <div className="maintenance-editor-option maintenance-editor-option--nested">
                      <label className="maintenance-editor-field" htmlFor="maintEditModsGameVersionPolicy">
                        <span className="maintenance-editor-field__label">{t('maintenance_opt_mods_game_version_label')}</span>
                        <select
                          id="maintEditModsGameVersionPolicy"
                          className="input"
                          value={form.optModsGameVersionPolicy}
                          onChange={(e) =>
                            editor.updateForm({
                              optModsGameVersionPolicy: e.target.value as MaintenanceModsGameVersionPolicy,
                            })
                          }
                        >
                          {MODS_GAME_VERSION_POLICIES.map(({ value, labelKey }) => (
                            <option key={value} value={value}>
                              {t(labelKey)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : null}
                  <div className="maintenance-editor-option">
                    <FccSwitch
                      id="maintEditOptMaintenance"
                      className="maintenance-editor-option__switch"
                      checked={form.optMaintenance}
                      onChange={(checked) => editor.updateForm({ optMaintenance: checked })}
                      label={t('maintenance_opt_stopped_mode')}
                    />
                    <span className="maintenance-editor-option__hint">{t('maintenance_opt_stopped_mode_hint')}</span>
                  </div>
                </div>
              </section>
            </div>

            <div className="maintenance-task-editor-layout__main">
              <section className="maintenance-editor-card maintenance-editor-card--schedule">
                <EditorCardHeader icon="autostart" title={t('maintenance_editor_section_schedule')} />
                <div className="maintenance-editor-card__body">
                  <div className="maintenance-editor-option">
                    <FccSwitch
                      id="maintEditManualOnly"
                      className="maintenance-editor-option__switch"
                      checked={form.manualOnly}
                      onChange={(checked) => editor.updateForm({ manualOnly: checked })}
                      label={t('maintenance_opt_manual_only_cb')}
                    />
                    <span className="maintenance-editor-option__hint">{t('maintenance_opt_manual_only_hint')}</span>
                  </div>
                  <div className="maintenance-editor-time-row">
                    <label className="maintenance-editor-field maintenance-editor-field--time" htmlFor="maintEditTime">
                      <span className="maintenance-editor-field__label">{t('maintenance_time_label')}</span>
                      <input
                        type="time"
                        id="maintEditTime"
                        className="input input--narrow"
                        step={60}
                        disabled={scheduleDisabled}
                        value={form.timeHhmm}
                        onChange={(e) => editor.updateForm({ timeHhmm: e.target.value })}
                      />
                      {!scheduleDisabled ? (
                        <span className="maintenance-editor-field__hint">{t('maintenance_time_local_hint')}</span>
                      ) : null}
                    </label>
                    <div className="maintenance-editor-next" aria-live="polite">
                      <span className="maintenance-editor-next__label">{t('maintenance_editor_next_event')}</span>
                      <span id="maintEditNextPreview" className="maintenance-editor-next__value">
                        {editor.nextPreview}
                      </span>
                    </div>
                  </div>
                  <div className="maintenance-editor-weekdays">
                    <span className="maintenance-editor-weekdays__label">{t('maintenance_weekdays_label')}</span>
                    <div className="maintenance-editor-weekdays__grid">
                      {WEEKDAYS.map((wd) => (
                        <label key={wd} className="maintenance-editor-weekday">
                          <input
                            type="checkbox"
                            id={'maintWd' + wd}
                            checked={form.weekdays.includes(wd)}
                            disabled={scheduleDisabled}
                            onChange={(e) => editor.toggleWeekday(wd, e.target.checked)}
                          />
                          <span>{t('maintenance_wd_' + wd)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="maintenance-editor-option">
                    <FccSwitch
                      id="maintEditRepeatWeekly"
                      className="maintenance-editor-option__switch"
                      checked={form.repeatWeekly}
                      disabled={repeatDisabled}
                      onChange={(checked) => editor.updateForm({ repeatWeekly: checked })}
                      label={t('maintenance_repeat_weekly_cb')}
                    />
                    <span className="maintenance-editor-option__hint">{t('maintenance_repeat_once_hint')}</span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
        <div className="fu-modal__footer maintenance-task-editor-modal__footer">
          <CancelButton id="btnMaintEditorClose" onClick={editor.close} disabled={editor.saving} t={t} />
          <button
            type="button"
            className="btn btn--primary btn--with-icon"
            id="btnMaintEditorSave"
            disabled={editor.saving}
            onClick={() => void editor.save()}
          >
            <AppIcon name="save" size={16} />
            {t('save_btn')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
