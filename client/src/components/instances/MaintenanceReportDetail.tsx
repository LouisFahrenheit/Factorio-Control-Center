import { useMemo } from 'react';
import { AppIcon } from '../AppIcon';
import {
  buildReportEventRows,
  formatMaintenanceReportSummary,
} from '../../lib/maintenanceReportUtils';
import { reportDurationBetween } from '../../lib/maintenanceUtils';
import type { MaintenanceReport } from '../../types/maintenance';

interface MaintenanceReportDetailProps {
  report: MaintenanceReport;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function MaintenanceReportDetail({ report, t }: MaintenanceReportDetailProps) {
  const summary = useMemo(
    () => formatMaintenanceReportSummary(report, t, (a, b) => reportDurationBetween(a, b, t)),
    [report, t],
  );
  const rows = useMemo(() => buildReportEventRows(report, t), [report, t]);
  const ok = report.success !== false;

  return (
    <div className="maintenance-report-detail">
      <div className="maintenance-report-detail__head">
        <div className="maintenance-report-detail__head-top">
          <AppIcon name="history" size={18} className="maintenance-report-detail__head-icon" />
          <div className="maintenance-report-detail__title">{summary.title}</div>
          <span
            className={
              'maintenance-report-detail__status ' +
              (ok ? 'maintenance-report-detail__status--ok' : 'maintenance-report-detail__status--fail')
            }
          >
            {ok ? t('maintenance_report_ok') : t('maintenance_report_fail')}
          </span>
        </div>
        <div className="maintenance-report-detail__meta">
          {summary.meta.map((line) => (
            <span key={line} className="maintenance-report-detail__meta-item">
              {line}
            </span>
          ))}
        </div>
      </div>
      <div className="maintenance-report-events-wrap">
        <table className="maintenance-report-events">
          <thead>
            <tr>
              <th className="maintenance-report-events__th maintenance-report-events__th--time">
                {t('maintenance_report_col_time')}
              </th>
              <th className="maintenance-report-events__th maintenance-report-events__th--action">
                {t('maintenance_report_col_action')}
              </th>
              <th className="maintenance-report-events__th maintenance-report-events__th--user">
                {t('maintenance_report_col_user')}
              </th>
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr>
                <td colSpan={3} className="maintenance-report-events__empty">
                  —
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr
                  key={`${row.time}-${idx}`}
                  className={
                    'maintenance-report-events__row' +
                    (row.ok === false ? ' maintenance-report-events__row--fail' : '')
                  }
                >
                  <td className="maintenance-report-events__time">{row.time}</td>
                  <td className="maintenance-report-events__action">
                    <div className="maintenance-report-events__action-main">{row.action}</div>
                    {row.details.length > 0 && (
                      <ul className="maintenance-report-events__details">
                        {row.details.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="maintenance-report-events__user">{row.actor}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
