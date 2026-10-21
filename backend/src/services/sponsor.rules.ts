import type { SponsorTier } from '../types/domain';

export const TIER_WEIGHT: Record<SponsorTier, number> = {
  Principal: 1,
  Oro: 2,
  Plata: 3,
  Bronce: 4,
};

interface ContractWindow {
  startDate?: Date | null;
  endDate?: Date | null;
}

export const isCurrent = (contract: ContractWindow, now: Date): boolean =>
  (!contract.startDate || contract.startDate.getTime() <= now.getTime()) &&
  (!contract.endDate || contract.endDate.getTime() >= now.getTime());

export function sortByTier<T extends { tier: SponsorTier; name: string }>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) => TIER_WEIGHT[a.tier] - TIER_WEIGHT[b.tier] || a.name.localeCompare(b.name),
  );
}
