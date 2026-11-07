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
export type Session = { authenticated: boolean; user: null|{id:string;email:string;role:string}; csrfToken: string; accessMode?:'AUTHENTICATED'|'LOCAL_SINGLE_USER'; phoneNfcOrigin?:string|null };
export type MeasurementConfirmation = {version:number;gross:string;tare:string;confirmed:true;reading?:{v:1;deviceId:string;seq:number;grossG:number;stable:boolean;calibrated:boolean;receivedAt:string;connectionId:string;transport:'usb'|'simulator';mode?:'APPROXIMATE';approximateAcknowledged?:boolean}};
async function sessionRequest(path: string, body?: unknown): Promise<Session> {
  const result = await request<{data:Session}>(path, body);
  if (!result.data || typeof result.data.csrfToken !== 'string' || typeof result.data.authenticated !== 'boolean') throw new ApiError('Invalid session response.',502);
  setCsrfToken(result.data.csrfToken);
  return result.data;
}
export const studioApi = {
  qrBatches:()=>request<{data:{id:string;count:number|string;createdAt:string;unused:number|string;assigned:number|string;retired:number|string}[]}>('/qr-batches'),
  qrBatch:(id:string)=>request<{data:import('./qr-label-pdf').QrBatch}>('/qr-batches/'+encodeURIComponent(id)),
  generateQrBatch:(count:number,requestKey:string)=>request<{data:import('./qr-label-pdf').QrBatch}>('/qr-batches',{count,requestKey,confirmed:true}),
  resolveQrLabel:(id:string)=>request<{data:{id:string;state:'UNUSED'|'ASSIGNED';spoolId:string|null;code:string|null}}>('/qr-labels/'+encodeURIComponent(id)),
  getSpoolSelection: () => request<{data:{selection:null|{spoolId:string;eventId:string;expiresAt:number}}}>('/spool-selection'),
  sendSpoolSelection: (spoolId:string) => request<{data:{selection:null|{spoolId:string;eventId:string;expiresAt:number}}}>('/spool-selection',{spoolId}),
  session: () => sessionRequest('/auth/session'),
  localBootstrap: () => sessionRequest('/auth/local-bootstrap',{}),
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
  confirmMeasurement: (id:string,revision:number,measurement:MeasurementConfirmation,key:string) => request<StockResponse>(`/spools/${encodeURIComponent(id)}/measurements`,{revision,...measurement},key),
  getScaleReading: () => request<{configured?:boolean;online?:boolean;observation?:import('./scale/manual-observation').ManualObservation;timing?:import('./scale/wifi-timing').WifiSnapshotTiming;reading:null|{frame:unknown;bootId:string;receivedAtMs:number;ageMs:number}}>('/scale-reading'),
};
