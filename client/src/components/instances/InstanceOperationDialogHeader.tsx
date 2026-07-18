import { AppIcon } from '../AppIcon';
import type { AppIconName } from '../../lib/appIcons';

export type InstanceOperationTone = 'accent' | 'danger' | 'neutral';

interface InstanceOperationDialogHeaderProps {
  id?: string;
  icon: AppIconName;
  title: string;
  tone?: InstanceOperationTone;
  running?: boolean;
  runningLabel?: string;
}

export function InstanceOperationDialogHeader({
  id,
  icon,
  title,
  tone = 'accent',
  running = false,
  runningLabel,
}: InstanceOperationDialogHeaderProps) {
  return (
    <div
      id={id}
      className={
        'fu-modal__header server-update-dialog__header instance-operation-dialog__header instance-operation-dialog__header--' +
        tone
      }
    >
      <AppIcon name={icon} size={22} className="server-update-dialog__header-icon" />
      <div className="server-update-dialog__header-text">
        <span className="server-update-dialog__header-title">{title}</span>
        {running && runningLabel ? (
          <span className="server-update-dialog__header-badge server-update-dialog__header-badge--active">
            {runningLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
