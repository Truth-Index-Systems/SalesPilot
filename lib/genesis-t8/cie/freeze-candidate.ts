/** CIE-R8 Legacy Mathematical Eradication + Freeze Candidate. */
import { CIE_AUTHORITY_MIGRATION_MAP, assertSingleAuthority, type CieAuthorityPath } from './composition';

export const GENESIS_T8_CIE_R8_VERSION = '1.0.0' as const;
export const GENESIS_T8_CIE_R8_BUILD = 'CIE-R8' as const;
export const GENESIS_T8_CIE_R8_STATUS = 'FREEZE_CANDIDATE' as const;

export const GENESIS_T8_CIE_R8_PROHIBITED_AUTHORITIES = Object.freeze([
  'LEGACY_OPPORTUNITY_SCORE_CONTROLS_READINESS',
  'LEGACY_WEIGHTED_ROUTE_SCORE_CONTROLS_SELECTION',
  'LEGACY_WEIGHTED_CONTACT_SCORE_CONTROLS_SELECTION',
  'AI_SELECTS_COMMERCIAL_ROUTE',
  'ENGAGEMENT_CONFIDENCE_CONTROLS_AUTOPILOT_APPROVAL',
  'SHADOW_OUTPUT_CONTROLS_BEHAVIOUR',
] as const);

export function assertCieR8FreezeCandidate(): void {
  const paths: readonly CieAuthorityPath[] = CIE_AUTHORITY_MIGRATION_MAP;
  assertSingleAuthority(paths);
  const governed = new Set(['opportunity scoring','route ranking','contact ranking','primary/secondary/fallback route selection','autonomous engagement quality authority']);
  const forbidden = paths.filter((p) => p.currentMode === 'LEGACY_TO_ERADICATE' || (governed.has(p.decision) && (p.currentMode === 'SHADOW' || (p.currentMode === 'AUTHORITATIVE' && p.currentOwner !== 'UDOSIB'))));
  if (forbidden.length) throw new Error(`CIE_R8_FREEZE_VIOLATION:${forbidden.map((x) => x.id).join(',')}`);
}

assertCieR8FreezeCandidate();
