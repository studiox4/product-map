/**
 * Shared color tokens for the marketing motion SVGs (hero scene + story SVGs).
 * Built around the canonical "Stagger" brand indigo (BrandMark.tsx / docs/brand),
 * with a small set of restrained status accents for the richer hero illustration.
 * Centralized so the graphics stay in lockstep if the brand palette shifts.
 */

// Brand indigo — two streams + a lighter highlight / playhead.
export const STAGGER_INK = '#4338CA'; // deep stream
export const STAGGER_LIT = '#6D63F0'; // lit stream
export const PLAYHEAD = '#818CF8'; // "today" playhead / highlight

// Indigo ramp (for glass-bar gradients).
export const INK_TOP = '#6E63F2';
export const INK_BASE = '#372BB0';
export const LIT_TOP = '#A39BFA';
export const LIT_BASE = '#5246D8';

// Restrained status accents (used sparingly on a couple of bars / pills / avatars).
export const TEAL = '#0E9AAE';
export const TEAL_TOP = '#3FC2D2';
export const AMBER = '#D08A2C';
export const AMBER_TOP = '#EBB35C';
export const SAGE = '#3C9A63';

// Surface tones for the floating glass panel.
export const PANEL_TINT = '#EEF1FB';
