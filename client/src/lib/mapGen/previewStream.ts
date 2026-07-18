import { getToken } from '../../api/client';

export type PreviewStreamEvent =
  | {
      ok: true;
      type: 'frame';
      preview_size: number;
      preview_png_base64: string;
      final: boolean;
    }
  | { ok: true; type: 'done' }
  | { ok: false; type: 'error'; error: string };

export async function streamMapPreview(
  body: Record<string, unknown>,
  onFrame: (b64: string, size: number, final: boolean) => void,
  signal?: AbortSignal,
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const lang = localStorage.getItem('fcc_lang') || '';
  if (lang) headers['X-FCC-UI-Lang'] = lang;

  const res = await fetch('/api/server/map-gen/preview-stream', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    let err = text;
    try {
      const j = JSON.parse(text) as { error?: string };
      err = j.error || text;
    } catch {
      /* ignore */
    }
    throw new Error(err || res.statusText);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('preview_stream_no_body');

  const decoder = new TextDecoder();
  let buf = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const evt = JSON.parse(trimmed) as PreviewStreamEvent;
      if (evt.type === 'frame') {
        onFrame(evt.preview_png_base64, evt.preview_size, evt.final);
      } else if (evt.type === 'error') {
        throw new Error(String(evt.error || 'preview_failed'));
      }
    }
  }

  if (buf.trim()) {
    const evt = JSON.parse(buf.trim()) as PreviewStreamEvent;
    if (evt.type === 'frame') {
      onFrame(evt.preview_png_base64, evt.preview_size, evt.final);
    } else if (evt.type === 'error') {
      throw new Error(String(evt.error || 'preview_failed'));
    }
  }
}
