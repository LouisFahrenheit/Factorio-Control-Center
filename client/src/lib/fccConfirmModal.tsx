import { createElement, type ReactNode } from 'react';
import { modals } from '@mantine/modals';
import { IconAlertTriangle } from '@tabler/icons-react';

export type FccConfirmVariant = 'default' | 'danger';

export type OpenFccConfirmOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant?: FccConfirmVariant;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
};

function parseConfirmMessage(message: string): {
  lead: string;
  details: string[];
  question?: string;
} {
  const parts = message.split('\n\n').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return { lead: message, details: [] };
  if (parts.length === 1) return { lead: parts[0], details: [] };

  const chunks = [...parts];
  let question: string | undefined;
  const last = chunks[chunks.length - 1];
  if (last.endsWith('?')) {
    question = last;
    chunks.pop();
  }

  const lead = chunks[0] || message;
  const details = chunks.slice(1).flatMap((block) =>
    block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  );
  return { lead, details, question };
}

function FccConfirmModalBody({
  message,
  variant,
}: {
  message: string;
  variant: FccConfirmVariant;
}) {
  const { lead, details, question } = parseConfirmMessage(message);
  const calloutClass =
    'fcc-confirm-modal__callout' +
    (variant === 'danger' ? ' fcc-confirm-modal__callout--danger' : '');

  return createElement(
    'div',
    { className: 'fcc-confirm-modal__content' },
    createElement('p', { className: 'fcc-confirm-modal__lead' }, lead),
    details.length
      ? createElement(
          'div',
          { className: calloutClass },
          createElement(
            'ul',
            { className: 'fcc-confirm-modal__callout-list' },
            ...details.map((line) => createElement('li', { key: line }, line)),
          ),
        )
      : null,
    question ? createElement('p', { className: 'fcc-confirm-modal__question' }, question) : null,
  );
}

function confirmTitle(title: string, variant: FccConfirmVariant): ReactNode {
  if (variant !== 'danger') return title;
  return createElement(
    'span',
    { className: 'fcc-confirm-modal__title' },
    createElement(IconAlertTriangle, {
      size: 18,
      stroke: 1.75,
      className: 'fcc-confirm-modal__title-icon',
      'aria-hidden': true,
    }),
    createElement('span', null, title),
  );
}

export function openFccConfirmModal(options: OpenFccConfirmOptions): string {
  const variant = options.variant || 'default';
  const confirmClass = variant === 'danger' ? 'btn btn--danger' : 'btn btn--primary';

  return modals.openConfirmModal({
    title: confirmTitle(options.title, variant),
    classNames: {
      content: 'fcc-modal fcc-modal--confirm',
      header: 'fcc-confirm-modal__header',
      body: 'fcc-confirm-modal__body',
      close: 'fcc-confirm-modal__close',
    },
    children: createElement(FccConfirmModalBody, {
      message: options.message,
      variant,
    }),
    labels: { confirm: options.confirmLabel, cancel: options.cancelLabel },
    cancelProps: { className: 'btn', variant: 'default' },
    confirmProps: { className: confirmClass, variant: 'default' },
    groupProps: { className: 'fcc-confirm-modal__actions' },
    onConfirm: options.onConfirm,
    onCancel: options.onCancel,
  });
}
