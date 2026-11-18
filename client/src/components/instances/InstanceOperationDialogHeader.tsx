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
        'mod-install-dialog__header instance-operation-dialog__header instance-operation-dialog__header--' +
        tone
      }
    >
      <div className="mod-install-dialog__header-main">
        <div
          className="mod-install-dialog__header-icon-wrap"
          style={
            tone === 'danger'
              ? {
                  color: 'var(--error, #ef4444)',
                  borderColor: 'rgba(239, 68, 68, 0.35)',
                  background: 'rgba(239, 68, 68, 0.12)',
                }
              : undefined
          }
        >
          <AppIcon name={icon} size={18} />
        </div>
        <div className="mod-install-dialog__header-titles">
          <h2 className="mod-install-dialog__title">{title}</h2>
        </div>
      </div>
      {running && runningLabel ? (
        <span className="server-update-dialog__header-badge server-update-dialog__header-badge--active">
          {runningLabel}
        </span>
      ) : null}
    </div>
  );
}
