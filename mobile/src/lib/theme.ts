export const colors = {
  background: '#f7f7f5',
  card: '#ffffff',
  text: '#18181b',
  muted: '#71717a',
  border: '#e4e4e7',
  input: '#d4d4d8',
  primary: '#047857',
  primaryPressed: '#065f46',
  primaryText: '#ffffff',
  accent: '#ecfdf5',
  positive: '#047857',
  negative: '#be123c',
  negativeBg: '#fff1f2',
  warning: '#b45309',
  subtle: '#f4f4f5',
};

export const radius = { sm: 8, md: 12, lg: 16, full: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

const AVATAR_COLORS = [
  ['#fef3c7', '#92400e'],
  ['#dbeafe', '#1e40af'],
  ['#fce7f3', '#9d174d'],
  ['#d1fae5', '#065f46'],
  ['#ede9fe', '#5b21b6'],
  ['#ffedd5', '#9a3412'],
  ['#cffafe', '#155e75'],
] as const;

export function avatarColors(id: string): readonly [string, string] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
