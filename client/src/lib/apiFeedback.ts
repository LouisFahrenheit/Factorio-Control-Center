import {
  isNetworkFetchError,
  notifyNetworkFetchError,
  resolveApiErrorMessage,
} from './networkErrors';
import { notifyErr, notifyOk, notifyWarn } from './notify';

export function feedbackOk(title: string, message?: string): void {
  const text = String(message || '').trim();
  if (!text) return;
  notifyOk(title, text);
}

export function feedbackErr(
  title: string,
  message?: string,
  t?: (key: string) => string,
): void {
  const text = String(message || '').trim();
  if (!text) return;
  if (t && isNetworkFetchError(text)) {
    notifyNetworkFetchError(title, text, t);
    return;
  }
  notifyErr(title, t ? resolveApiErrorMessage(text, t) : text);
}

export function feedbackWarn(title: string, message?: string): void {
  const text = String(message || '').trim();
  if (!text) return;
  notifyWarn(title, text);
}

export function feedbackMsg(
  title: string,
  message: string,
  isErr = false,
  isWarn = false,
  t?: (key: string) => string,
): void {
  if (isWarn) feedbackWarn(title, message);
  else if (isErr) feedbackErr(title, message, t);
  else feedbackOk(title, message);
}
