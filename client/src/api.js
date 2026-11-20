import { useCallback, useEffect, useState } from 'react';

async function request(method, url, body) {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
  /** Sends one file as the raw request body (used for bill photos / PDFs). */
  upload: async (url, blob, name) => {
    const res = await fetch(`/api${url}`, {
      method: 'POST',
      headers: { 'content-type': blob.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(name) },
      body: blob,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
    return data;
  },
};

/** Load a GET endpoint; returns { data, error, loading, reload }. */
export function useData(url) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const reload = useCallback(() => {
    if (!url) return Promise.resolve();
    setState((s) => ({ ...s, loading: true }));
    return api.get(url)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => setState({ data: null, error, loading: false }));
  }, [url]);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}
