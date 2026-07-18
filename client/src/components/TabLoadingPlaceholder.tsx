import type { ReactNode } from 'react';

export type TabLoadingVariant = 'split' | 'table' | 'grid' | 'form' | 'dashboard';

export function tabInitialLoad(loading: boolean, hasData: boolean): boolean {
  return loading && !hasData;
}

function SkeletonBar({ wide }: { wide?: boolean }) {
  return (
    <span
      className={'save-mod-skeleton' + (wide ? ' save-mod-skeleton--name' : ' save-mod-skeleton--ver')}
      aria-hidden="true"
    />
  );
}

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="table-wrap tab-loading__table-wrap">
      <table className="data tab-loading__table" aria-hidden="true">
        <thead>
          <tr>
            {Array.from({ length: cols }, (_, i) => (
              <th key={i}>
                <SkeletonBar wide={i === 0} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, row) => (
            <tr key={row} className="tab-loading__row">
              {Array.from({ length: cols }, (_, col) => (
                <td key={col}>
                  <SkeletonBar wide={col === 0} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SplitSkeleton() {
  return (
    <div className="tab-loading__split">
      <div className="tab-loading__split-pane">
        <TableSkeleton rows={7} cols={2} />
      </div>
      <div className="tab-loading__split-pane tab-loading__split-pane--detail">
        <div className="tab-loading__detail-head">
          <SkeletonBar wide />
        </div>
        <TableSkeleton rows={5} cols={4} />
      </div>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="tab-loading__grid" aria-hidden="true">
      {Array.from({ length: 3 }, (_, group) => (
        <section key={group} className="tab-loading__grid-group">
          <span className="save-mod-skeleton save-mod-skeleton--name tab-loading__grid-title" />
          <div className="tab-loading__grid-items">
            {Array.from({ length: 6 }, (_, item) => (
              <span key={item} className="tab-loading__grid-item">
                <SkeletonBar wide />
              </span>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="tab-loading__form" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="tab-loading__form-row">
          <span className="save-mod-skeleton save-mod-skeleton--name tab-loading__form-label" />
          <span className="save-mod-skeleton save-mod-skeleton--fv tab-loading__form-field" />
        </div>
      ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="tab-loading__dashboard" aria-hidden="true">
      <div className="tab-loading__dashboard-main">
        <div className="tab-loading__block tab-loading__block--chat">
          <span className="save-mod-skeleton save-mod-skeleton--name tab-loading__block-title" />
          <div className="tab-loading__chat-area">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className="save-mod-skeleton tab-loading__chat-line" style={{ width: `${55 + (i % 3) * 12}%` }} />
            ))}
          </div>
        </div>
        <div className="tab-loading__block">
          <span className="save-mod-skeleton save-mod-skeleton--name tab-loading__block-title" />
          <TableSkeleton rows={5} cols={5} />
        </div>
      </div>
      <div className="tab-loading__dashboard-side">
        <div className="tab-loading__block">
          <span className="save-mod-skeleton save-mod-skeleton--name tab-loading__block-title" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="tab-loading__form-row tab-loading__form-row--compact">
              <SkeletonBar wide />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface TabLoadingPlaceholderProps {
  variant?: TabLoadingVariant;
  label?: string;
  className?: string;
}

export function TabLoadingPlaceholder({
  variant = 'table',
  label,
  className,
}: TabLoadingPlaceholderProps) {
  let body: ReactNode;
  switch (variant) {
    case 'split':
      body = <SplitSkeleton />;
      break;
    case 'grid':
      body = <GridSkeleton />;
      break;
    case 'form':
      body = <FormSkeleton />;
      break;
    case 'dashboard':
      body = <DashboardSkeleton />;
      break;
    default:
      body = <TableSkeleton rows={8} cols={4} />;
  }

  return (
    <div
      className={'tab-loading tab-loading--' + variant + (className ? ' ' + className : '')}
      aria-busy="true"
      aria-live="polite"
    >
      {label ? (
        <div className="tab-loading__status">
          <span className="tab-loading__spinner" aria-hidden="true" />
          <span className="tab-loading__label">{label}</span>
        </div>
      ) : null}
      {body}
    </div>
  );
}
