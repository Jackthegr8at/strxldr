import type { SectionVisibility } from './types';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const defaults = (): SectionVisibility => ({
  recentActivity: true,
  newStakers: true,
  tierMilestones: true
});
function normalize(value: unknown): SectionVisibility | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as SectionVisibility;
  return typeof item.recentActivity === 'boolean' && typeof item.newStakers === 'boolean' && typeof item.tierMilestones === 'boolean' ? {
    recentActivity: item.recentActivity,
    newStakers: item.newStakers,
    tierMilestones: item.tierMilestones
  } : null;
}
export function readSectionVisibility(storage: StorageLike | undefined): SectionVisibility {
  try {
    const parsed = JSON.parse(storage?.getItem('sectionVisibility') ?? 'null');
    return normalize(parsed && typeof parsed === 'object' && 'version' in parsed ? parsed.version === 1 ? parsed.value : null : parsed) ?? defaults();
  } catch {
    return defaults();
  }
}
export function writeSectionVisibility(storage: StorageLike | undefined, value: SectionVisibility) {
  try {
    storage?.setItem('sectionVisibility', JSON.stringify({
      version: 1,
      value: normalize(value) ?? defaults()
    }));
  } catch {/* Preferences are optional. */}
}
export function preferenceStorage(): StorageLike | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
