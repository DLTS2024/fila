import type { InventoryState } from './inventory';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE = '/api/v1';
let csrfToken: string | undefined;
// The future PHP session/login response supplies this token.
export function setCsrfToken(token?: string) { csrfToken = token; }

export async function request<T>(path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${BASE}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new ApiError('PHP API unavailable: expected JSON from /api/v1. Inventory saves are disabled until the backend is connected.', response.status);
    }
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 && !path.startsWith('/auth/') && typeof window !== 'undefined') window.dispatchEvent(new window.Event('dloop:session-expired'));
      throw new ApiError(typeof data.error === 'string' ? data.error : 'The API request failed.', response.status);
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Unable to reach the PHP API. Check the local backend and retry.', 0);
  } finally { clearTimeout(timer); }
}

export type StockResponse = { revision: number; state: InventoryState };
export type Session = { authenticated: boolean; user: null|{id:string;email:string;role:string}; csrfToken: string };
async function sessionRequest(path: string, body?: unknown): Promise<Session> {
  const result = await request<{data:Session}>(path, body);
  if (!result.data || typeof result.data.csrfToken !== 'string' || typeof result.data.authenticated !== 'boolean') throw new ApiError('Invalid session response.',502);
  setCsrfToken(result.data.csrfToken);
  return result.data;
}
export const studioApi = {
  session: () => sessionRequest('/auth/session'),
  login: (email:string,password:string) => sessionRequest('/auth/login',{email,password}),
  logout: () => sessionRequest('/auth/logout',{}),
  async getStock(): Promise<StockResponse> {
    const data = await request<StockResponse>('/stock');
    if (!Number.isInteger(data.revision) || data.revision < 0 ||
        !Array.isArray(data.state?.spools) || !Array.isArray(data.state?.history) ||
        !data.state?.slots || typeof data.state.slots !== 'object') {
      throw new ApiError('The inventory API returned an invalid response.', 502);
    }
    return data;
  },
  updateStock: (revision: number, action: unknown, key: string = crypto.randomUUID()) => request<StockResponse>('/stock', { revision, action }, key),
  getScaleReading: () => request<{reading: {gross_g: number; stable: number; recorded_at: string} | null}>('/scale-reading'),
};
