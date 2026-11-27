import { createHash } from 'node:crypto';
import type { AffiliateConfig, Agreement } from './affiliate.types';

export const AGREEMENT_VARIABLES = ['affiliate_name', 'affiliate_identifier', 'affiliate_account_id', 'jitu_party',
  'agreement_version', 'effective_date', 'base_commission', 'base_discount', 'boost_configuration', 'acceptance_timestamp'];
export function hashContent(content: string) { return createHash('sha256').update(content, 'utf8').digest('hex'); }

/** Markdown is rendered as React text, never as HTML, in the Team application. */
export function renderAgreement(agreement: Agreement, member: { id: string; name: string; email: string }, config: AffiliateConfig, timestamp = '{{acceptance_timestamp}}') {
  const percentage = (bps: number) => `${bps / 100}%`;
  const values: Record<string, string> = {
    affiliate_name: member.name, affiliate_identifier: member.email, affiliate_account_id: member.id,
    jitu_party: agreement.party, agreement_version: String(agreement.version),
    effective_date: agreement.effectiveAt?.toISOString() ?? 'Belum ditentukan',
    base_commission: percentage(config.commission), base_discount: percentage(config.discount),
    boost_configuration: Object.entries(config.boosts).map(([type, b]) =>
      `${type}: +${percentage(b.additional)} percentage points; ${b.quota}/bulan; ${b.durationHours} jam; ${b.available ? 'tersedia' : 'tidak tersedia'}${b.maxTransactions ? `; maksimal ${b.maxTransactions} transaksi/aktivasi` : ''}`).join('\n'),
    acceptance_timestamp: timestamp,
  };
  return agreement.content.replace(/\{\{([a-z_]+)\}\}/g, (token, key: string) => values[key] ?? token);
}
