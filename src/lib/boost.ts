export function isNewBoost(
  oldPremiumSince: Date | null,
  newPremiumSince: Date | null,
): boolean {
  return oldPremiumSince == null && newPremiumSince != null;
}
