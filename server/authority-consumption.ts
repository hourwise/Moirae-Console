export const DEFAULT_AUTHORITY_CONSUMPTION_MAX_ENTRIES = 1_024;

export type AuthorityConsumptionClaim =
  | { readonly accepted: true }
  | {
      readonly accepted: false;
      readonly reason: 'replayed' | 'expired' | 'capacity' | 'unavailable';
    };

export interface AuthorityConsumptionStore {
  claim(receiptId: string, expiresAtMs: number, nowMs: number): AuthorityConsumptionClaim;
}

/**
 * Bounded host-local one-use store. It deliberately does not claim restart
 * persistence; a production deployment must replace it with a durable,
 * authenticated store before relying on cross-restart replay protection.
 */
export class InMemoryAuthorityConsumptionStore implements AuthorityConsumptionStore {
  private readonly consumed = new Map<string, number>();

  public constructor(private readonly maxEntries = DEFAULT_AUTHORITY_CONSUMPTION_MAX_ENTRIES) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      throw new TypeError('Authority consumption max entries must be a positive safe integer');
    }
  }

  public claim(receiptId: string, expiresAtMs: number, nowMs: number): AuthorityConsumptionClaim {
    if (!receiptId || !Number.isFinite(expiresAtMs) || !Number.isFinite(nowMs)) {
      return { accepted: false, reason: 'unavailable' };
    }

    for (const [key, expiry] of this.consumed) {
      if (expiry <= nowMs) this.consumed.delete(key);
    }

    if (nowMs >= expiresAtMs) return { accepted: false, reason: 'expired' };
    if (this.consumed.has(receiptId)) return { accepted: false, reason: 'replayed' };
    if (this.consumed.size >= this.maxEntries) return { accepted: false, reason: 'capacity' };

    this.consumed.set(receiptId, expiresAtMs);
    return { accepted: true };
  }
}
