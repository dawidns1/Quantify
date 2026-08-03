export interface NeonColorTheme {
  hex: string;
  label: string;
  bg: string;
  border: string;
  glow: string;
}

export const NEON_PALETTE: Record<string, NeonColorTheme> = {
  cyan: {
    hex: '#06b6d4',
    label: 'Neon Cyan',
    bg: 'rgba(6, 182, 212, 0.15)',
    border: '1px solid rgba(6, 182, 212, 0.45)',
    glow: '0 0 8px rgba(6, 182, 212, 0.35)'
  },
  emerald: {
    hex: '#10b981',
    label: 'Neon Emerald',
    bg: 'rgba(16, 185, 129, 0.15)',
    border: '1px solid rgba(16, 185, 129, 0.45)',
    glow: '0 0 8px rgba(16, 185, 129, 0.35)'
  },
  violet: {
    hex: '#a855f7',
    label: 'Neon Violet',
    bg: 'rgba(168, 85, 247, 0.15)',
    border: '1px solid rgba(168, 85, 247, 0.45)',
    glow: '0 0 8px rgba(168, 85, 247, 0.35)'
  },
  amber: {
    hex: '#f59e0b',
    label: 'Neon Amber',
    bg: 'rgba(245, 158, 11, 0.15)',
    border: '1px solid rgba(245, 158, 11, 0.45)',
    glow: '0 0 8px rgba(245, 158, 11, 0.35)'
  },
  rose: {
    hex: '#ec4899',
    label: 'Neon Rose',
    bg: 'rgba(236, 72, 153, 0.15)',
    border: '1px solid rgba(236, 72, 153, 0.45)',
    glow: '0 0 8px rgba(236, 72, 153, 0.35)'
  },
  blue: {
    hex: '#3b82f6',
    label: 'Neon Blue',
    bg: 'rgba(59, 130, 246, 0.15)',
    border: '1px solid rgba(59, 130, 246, 0.45)',
    glow: '0 0 8px rgba(59, 130, 246, 0.35)'
  }
};

const PALETTE_KEYS = Object.keys(NEON_PALETTE);

export function getAccountNeonTheme(accountName: string = 'Default', customColorsMap?: Record<string, string>): NeonColorTheme {
  const normName = (accountName || 'Default').trim();
  
  if (customColorsMap && customColorsMap[normName]) {
    const keyOrHex = customColorsMap[normName].toLowerCase();
    if (NEON_PALETTE[keyOrHex]) {
      return NEON_PALETTE[keyOrHex];
    }
  }

  let hash = 0;
  for (let i = 0; i < normName.length; i++) {
    hash = normName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PALETTE_KEYS.length;
  return NEON_PALETTE[PALETTE_KEYS[index]];
}
