import { AppIcon } from '../AppIcon';
import type { AppIconName } from '../../lib/appIcons';
import type { InstanceOperationTone } from './InstanceOperationDialogHeader';

interface InstanceOperationProgressProps {
  tone?: InstanceOperationTone;
  icon: AppIconName;
  statusText: string;
  serverName?: string;
  serverHint?: string;
  progressWidth?: string;
  progressMeta?: string;
  ariaBusy?: boolean;
}

function statusKind(tone: InstanceOperationTone): string {
  if (tone === 'danger') return 'error';
  return 'download';
}

function barClass(tone: InstanceOperationTone, progressWidth?: string): string {
  const base = 'server-update-dialog__bar';
  if (!progressWidth) {
    return base + ' server-update-dialog__bar--indeterminate' + (tone === 'danger' ? ' server-update-dialog__bar--danger' : '');
  }
  return base + (tone === 'danger' ? ' server-update-dialog__bar--danger' : '');
}

export function InstanceOperationProgress({
  tone = 'accent',
  icon,
  statusText,
  serverName,
  serverHint,
  progressWidth,
  progressMeta,
  ariaBusy = true,
}: InstanceOperationProgressProps) {
  const kind = statusKind(tone);

  return (
    <div className="server-update-dialog__progress instance-operation-dialog__progress">
      {serverName ? (
        <div className={'instance-operation-dialog__target instance-operation-dialog__target--' + tone}>
          <AppIcon name="list" size={22} className="instance-operation-dialog__target-icon" />
          <div className="instance-operation-dialog__target-text">
            <span className="instance-operation-dialog__target-name">{serverName}</span>
            {serverHint ? <span className="instance-operation-dialog__target-hint">{serverHint}</span> : null}
          </div>
        </div>
      ) : null}

      <div className={'server-update-dialog__status-card server-update-dialog__status-card--' + kind} role="status">
        <span className="server-update-dialog__status-icon-wrap" aria-hidden="true">
          <AppIcon name={icon} size={18} className="server-update-dialog__status-icon" />
        </span>
        <span className="server-update-dialog__status-text">{statusText}</span>
      </div>

      <div className="server-update-dialog__progress-block">
        <div
          className="server-update-dialog__progress-track fu-progress"
          role="progressbar"
          aria-valuetext={statusText}
          aria-busy={ariaBusy}
        >
          <div className={barClass(tone, progressWidth)} style={progressWidth ? { width: progressWidth } : undefined} />
        </div>
        {progressMeta ? (
          <div className="server-update-dialog__progress-meta">
            <span className="server-update-dialog__progress-text">{progressMeta}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
