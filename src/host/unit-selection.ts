export type UnitSelection = { readonly kind: "enemy"; readonly id: string }
  | { readonly kind: "player"; readonly id: string }
  | null;
