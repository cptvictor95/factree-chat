import type { Identity } from 'spacetimedb';

// Fixed warm palette — each color works in both light and dark modes.
// The first byte of the identity hex deterministically picks the color,
// so each user always gets the same one across sessions.
const IDENTITY_PALETTE = [
  '#e8a030', // amber (matches accent)
  '#e05a3a', // terracotta
  '#5a9ed4', // dusty blue
  '#9b72cf', // soft lavender
  '#4caf7d', // sage green
  '#d4625a', // warm rose
];

export function identityToColor(identity: Identity): string {
  const hex = identity.toHexString();
  const idx = parseInt(hex.substring(0, 2), 16) % IDENTITY_PALETTE.length;
  return IDENTITY_PALETTE[idx];
}

export function identityToShortId(identity: Identity): string {
  return identity.toHexString().substring(0, 8);
}
