// The Referrals page's order, in one place, so the order can change here alone. Row A's order is also the phone
// order, where the two cards stack: links first (the page's action), then Referral credit. Then the sections in order.
export const ROW_A = ['links', 'credit'] as const;
export const SECTIONS = ['levels', 'people', 'monthly'] as const;

export type RowACard = (typeof ROW_A)[number];
export type Section = (typeof SECTIONS)[number];
