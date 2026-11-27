export const BOOST_TYPES = ['COMMISSION', 'DISCOUNT', 'SUPER_DISCOUNT'] as const;
export type BoostType = typeof BOOST_TYPES[number];
export interface BoostPolicy {
  additional: number; quota: number; durationHours: number;
  available: boolean; maxTransactions: number | null;
}
export interface AffiliateConfig {
  discount: number; commission: number; boosts: Record<BoostType, BoostPolicy>;
}
export interface AffiliateIdentity {
  id: string; userId: string; name: string; email: string; role: string; isActive: boolean;
}
export interface Agreement {
  id: string; version: number; title: string; content: string; party: string;
  summary: string; status: string; effectiveAt: Date | null; requiresAcceptance: boolean;
  publishedAt: Date | null;
}
export interface Acceptance {
  id: string; agreementId: string; version: number; snapshot: string;
  acceptedAt: Date; contentHash: string; identity: Record<string, string>; status: string;
}
