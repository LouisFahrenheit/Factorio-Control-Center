export function selectedInstanceStorageKey(username: string): string {
  return `fcc_selected_instance_${String(username || '').trim()}`;
}

export function getStoredSelectedInstance(username: string): string {
  const key = selectedInstanceStorageKey(username);
  if (!key || key === 'fcc_selected_instance_') return '';
  return localStorage.getItem(key) || '';
}

export function setStoredSelectedInstance(username: string, instanceId: string): void {
  const key = selectedInstanceStorageKey(username);
  if (!key || key === 'fcc_selected_instance_') return;
  const id = String(instanceId || '').trim();
  if (id) localStorage.setItem(key, id);
  else localStorage.removeItem(key);
}

export function clearStoredSelectedInstance(username: string): void {
  setStoredSelectedInstance(username, '');
}
