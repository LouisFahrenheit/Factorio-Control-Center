import { notifications } from '@mantine/notifications';
import { IconCheck, IconAlertTriangle, IconX } from '@tabler/icons-react';
import { getToastAutoCloseMs } from './userPrefs';

const TOAST_ICON_SIZE = 22;

const TOAST_CLASS_NAMES = {
  body: 'fcc-toast__body',
  title: 'fcc-toast__title',
  description: 'fcc-toast__description',
  icon: 'fcc-toast__icon',
  closeButton: 'fcc-toast__close',
} as const;

function toastClassNames(variant: 'ok' | 'err' | 'warn') {
  return {
    ...TOAST_CLASS_NAMES,
    root: `fcc-toast fcc-toast--${variant}`,
  };
}

function toastOptions() {
  return {
    autoClose: getToastAutoCloseMs(),
    withBorder: false,
  };
}

export function notifyOk(title: string, message?: string) {
  notifications.show({
    title,
    message,
    icon: <IconCheck size={TOAST_ICON_SIZE} stroke={2.2} />,
    classNames: toastClassNames('ok'),
    ...toastOptions(),
  });
}

export function notifyErr(title: string, message?: string) {
  notifications.show({
    title,
    message,
    icon: <IconX size={TOAST_ICON_SIZE} stroke={2.2} />,
    classNames: toastClassNames('err'),
    ...toastOptions(),
  });
}

export function notifyWarn(title: string, message?: string) {
  notifications.show({
    title,
    message,
    icon: <IconAlertTriangle size={TOAST_ICON_SIZE} stroke={2.2} />,
    classNames: toastClassNames('warn'),
    ...toastOptions(),
  });
}

export function notifyFromError(err: unknown, title: string) {
  const msg = err instanceof Error ? err.message : title;
  notifyErr(title, msg);
}
