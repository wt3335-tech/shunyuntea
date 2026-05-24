const API_URL = import.meta.env?.VITE_GAS_URL || '';

export async function dbLoad() {
  if (!API_URL) return null;
  try {
    const r = await fetch(API_URL + '?action=load');
    const j = await r.json();
    return j.data ? JSON.parse(j.data) : null;
  } catch { return null; }
}

export async function dbSave(data) {
  if (!API_URL) return;
  try {
    await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'save', data: JSON.stringify(data) })
    });
  } catch {}
}
