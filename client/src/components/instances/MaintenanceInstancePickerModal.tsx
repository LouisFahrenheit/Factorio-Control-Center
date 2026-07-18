import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { MaintenanceTaskEditorApi } from '../../hooks/useMaintenanceTaskEditor';
import type { InstanceItem } from '../../types/instance';

interface MaintenanceInstancePickerModalProps {
  editor: MaintenanceTaskEditorApi;
  instances: InstanceItem[];
  t: (key: string, ...args: (string | number)[]) => string;
}

export function MaintenanceInstancePickerModal({ editor, instances, t }: MaintenanceInstancePickerModalProps) {
  const { pickerTemp, wantUpdates } = editor;

  return (
    <ModalBackdrop open={editor.pickerOpen} id="maintenanceInstancePickerBackdrop" onClose={editor.closePicker}>
      <div
        className="fu-modal maintenance-instance-picker-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="maintPickInstancesTitle"
      >
        <div className="fu-modal__header maintenance-instance-picker-modal__header" id="maintPickInstancesTitle">
          <AppIcon name="list" size={20} className="maintenance-instance-picker-modal__header-icon" />
          <span className="maintenance-instance-picker-modal__header-title">
            {t('maintenance_pick_instances_title')}
          </span>
        </div>
        <div className="fu-modal__body maintenance-instance-picker-modal__body">
          <label className="maintenance-instance-picker__all-row">
            <input
              type="checkbox"
              id="maintPickAll"
              checked={pickerTemp.all}
              onChange={(e) => editor.setPickerAll(e.target.checked)}
            />
            <span>{t('maintenance_instance_all')}</span>
          </label>
          <div id="maintPickInstanceList" className="maintenance-instance-picker__list">
            {instances.map((it) => {
              const id = String(it.id || '').trim();
              if (!id) return null;
              const blocked = wantUpdates && !!it.blockUpdates;
              const checked = !pickerTemp.all && pickerTemp.ids.includes(id);
              return (
                <label
                  key={id}
                  className={
                    'maintenance-instance-picker__row' +
                    (checked ? ' maintenance-instance-picker__row--selected' : '') +
                    (blocked ? ' maintenance-instance-picker__row--blocked' : '')
                  }
                >
                  <input
                    type="checkbox"
                    value={id}
                    checked={checked}
                    disabled={pickerTemp.all || blocked}
                    onChange={(e) => editor.togglePickerInstance(id, e.target.checked)}
                  />
                  <span title={blocked ? t('instances_block_updates_cb') : undefined}>
                    {String(it.name || id).trim() || id}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <div className="fu-modal__footer maintenance-instance-picker-modal__footer">
          <CancelButton id="btnMaintPickCancel" onClick={editor.closePicker} t={t} />
          <button type="button" className="btn btn--primary btn--with-icon" id="btnMaintPickOk" onClick={editor.confirmPicker}>
            <AppIcon name="save" size={16} />
            {t('maintenance_pick_instances_done')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
