export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      credentials: 'include',
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the RelayDesk API. Is it running?');
  }
  let json: Envelope<T> | null = null;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    /* non-JSON response */
  }
  if (!res.ok || !json?.success) {
    throw new ApiError(res.status, json?.error?.code ?? 'HTTP_ERROR', json?.error?.message ?? `Request failed (${res.status})`);
  }
  return json.data as T;
}
