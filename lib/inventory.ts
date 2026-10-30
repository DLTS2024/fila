import type { State, Spool, Entry, Filament } from './stock';
export type Brand = { id: string; name: string; active: boolean; version: number };
export type TareProfile = { id: string; brandId: string; spoolType: string; capacity: number; tare: number; verified: boolean; active: boolean; version: number; notes: string };
export type ManagedSpool = Spool & { code?: string; version?: number; brandId?: string; colorName?: string; capacity?: number; spoolType?: string; registrationKind?: 'sealed'|'partial'; profileId?: string|null; tareOverride?: number|null; tareDefault?: number|null; tareKnown?: boolean; gross?: number|null; status?: 'active'|'archived' };
export type Product = Filament & { brandId?: string; colorName?: string; profileId?: string|null; tareKnown?: boolean };
export type ManagedEntry = Entry & { actor?: string; canUndo?: boolean };
export type InventoryState = Omit<State,'spools'|'history'|'catalogue'> & { spools: ManagedSpool[]; history: ManagedEntry[]; catalogue?: Product[]; brands?: Brand[]; profiles?: TareProfile[] };
