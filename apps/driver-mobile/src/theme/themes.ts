/**
 * Theme tokens for the driver app.
 *
 * Colors are stored as space-separated RGB channels ("R G B") so they can feed
 * both:
 *   - CSS variables consumed by Tailwind via `rgb(var(--color-x) / <alpha>)`
 *     (enables opacity modifiers like `bg-primary/20`), and
 *   - imperative React Native color props via `toRgb()`.
 *
 * Neutrals are shared across accent themes (per light/dark scheme); each of the
 * 8 themes swaps only the accent (primary) ramp. Switching mode or theme
 * re-applies these as inline CSS variables at the root (see ThemeProvider), so
 * every token-based `className` updates across the whole app instantly.
 */

export type ColorScheme = 'light' | 'dark';
export type ThemeMode = ColorScheme | 'system';
export type ThemeName =
  | 'blue'
  | 'violet'
  | 'emerald'
  | 'rose'
  | 'amber'
  | 'teal'
  | 'indigo'
  | 'slate';

/** Semantic token names — one CSS variable + one Tailwind color each. */
export type TokenName =
  | 'background'
  | 'surface'
  | 'card'
  | 'foreground'
  | 'muted'
  | 'border'
  | 'input'
  | 'primary'
  | 'primary-foreground'
  | 'primary-muted'
  | 'primary-muted-foreground';

export const TOKEN_NAMES: TokenName[] = [
  'background',
  'surface',
  'card',
  'foreground',
  'muted',
  'border',
  'input',
  'primary',
  'primary-foreground',
  'primary-muted',
  'primary-muted-foreground',
];

type NeutralTokens = Pick<
  Record<TokenName, string>,
  'background' | 'surface' | 'card' | 'foreground' | 'muted' | 'border' | 'input'
>;

type AccentTokens = Pick<
  Record<TokenName, string>,
  'primary' | 'primary-foreground' | 'primary-muted' | 'primary-muted-foreground'
>;

/** Neutral surfaces + text, shared by every accent theme. */
const NEUTRALS: Record<ColorScheme, NeutralTokens> = {
  light: {
    background: '248 250 252', // slate-50
    surface: '255 255 255', // white (headers / bars)
    card: '255 255 255', // white
    foreground: '15 23 42', // slate-900
    muted: '100 116 139', // slate-500
    border: '226 232 240', // slate-200
    input: '241 245 249', // slate-100
  },
  dark: {
    background: '11 17 32', // near slate-950
    surface: '17 24 39', // gray-900
    card: '30 41 59', // slate-800
    foreground: '241 245 249', // slate-100
    muted: '148 163 184', // slate-400
    border: '51 65 85', // slate-700
    input: '30 41 59', // slate-800
  },
};

interface ThemeDef {
  /** Human label for the settings UI. */
  label: string;
  /** Representative hex swatch for the settings picker. */
  swatch: string;
  accents: Record<ColorScheme, AccentTokens>;
}

export const THEMES: Record<ThemeName, ThemeDef> = {
  blue: {
    label: 'Blue',
    swatch: '#2563eb',
    accents: {
      light: {
        primary: '37 99 235', // blue-600
        'primary-foreground': '255 255 255',
        'primary-muted': '219 234 254', // blue-100
        'primary-muted-foreground': '30 64 175', // blue-800
      },
      dark: {
        primary: '59 130 246', // blue-500
        'primary-foreground': '255 255 255',
        'primary-muted': '30 58 138', // blue-900
        'primary-muted-foreground': '191 219 254', // blue-200
      },
    },
  },
  violet: {
    label: 'Violet',
    swatch: '#7c3aed',
    accents: {
      light: {
        primary: '124 58 237',
        'primary-foreground': '255 255 255',
        'primary-muted': '237 233 254',
        'primary-muted-foreground': '91 33 182',
      },
      dark: {
        primary: '139 92 246',
        'primary-foreground': '255 255 255',
        'primary-muted': '76 29 149',
        'primary-muted-foreground': '221 214 254',
      },
    },
  },
  emerald: {
    label: 'Emerald',
    swatch: '#059669',
    accents: {
      light: {
        primary: '5 150 105',
        'primary-foreground': '255 255 255',
        'primary-muted': '209 250 229',
        'primary-muted-foreground': '6 95 70',
      },
      dark: {
        primary: '16 185 129',
        'primary-foreground': '255 255 255',
        'primary-muted': '6 78 59',
        'primary-muted-foreground': '167 243 208',
      },
    },
  },
  rose: {
    label: 'Rose',
    swatch: '#e11d48',
    accents: {
      light: {
        primary: '225 29 72',
        'primary-foreground': '255 255 255',
        'primary-muted': '255 228 230',
        'primary-muted-foreground': '159 18 57',
      },
      dark: {
        primary: '244 63 94',
        'primary-foreground': '255 255 255',
        'primary-muted': '136 19 55',
        'primary-muted-foreground': '254 205 211',
      },
    },
  },
  amber: {
    label: 'Amber',
    swatch: '#d97706',
    accents: {
      // Amber is light even at 600, so foreground stays near-black for contrast.
      light: {
        primary: '217 119 6',
        'primary-foreground': '24 24 27', // zinc-900
        'primary-muted': '254 243 199',
        'primary-muted-foreground': '146 64 14',
      },
      dark: {
        primary: '245 158 11',
        'primary-foreground': '24 24 27',
        'primary-muted': '120 53 15',
        'primary-muted-foreground': '253 230 138',
      },
    },
  },
  teal: {
    label: 'Teal',
    swatch: '#0d9488',
    accents: {
      light: {
        primary: '13 148 136',
        'primary-foreground': '255 255 255',
        'primary-muted': '204 251 241',
        'primary-muted-foreground': '17 94 89',
      },
      dark: {
        primary: '20 184 166',
        'primary-foreground': '255 255 255',
        'primary-muted': '19 78 74',
        'primary-muted-foreground': '153 246 228',
      },
    },
  },
  indigo: {
    label: 'Indigo',
    swatch: '#4f46e5',
    accents: {
      light: {
        primary: '79 70 229',
        'primary-foreground': '255 255 255',
        'primary-muted': '224 231 255',
        'primary-muted-foreground': '55 48 163',
      },
      dark: {
        primary: '99 102 241',
        'primary-foreground': '255 255 255',
        'primary-muted': '49 46 129',
        'primary-muted-foreground': '199 210 254',
      },
    },
  },
  slate: {
    label: 'Graphite',
    swatch: '#475569',
    accents: {
      light: {
        primary: '51 65 85', // slate-700
        'primary-foreground': '255 255 255',
        'primary-muted': '241 245 249', // slate-100
        'primary-muted-foreground': '51 65 85',
      },
      dark: {
        primary: '100 116 139', // slate-500
        'primary-foreground': '255 255 255',
        'primary-muted': '51 65 85', // slate-700
        'primary-muted-foreground': '226 232 240', // slate-200
      },
    },
  },
};

/** Ordered list for the settings picker. */
export const THEME_LIST: { name: ThemeName; label: string; swatch: string }[] =
  (Object.keys(THEMES) as ThemeName[]).map((name) => ({
    name,
    label: THEMES[name].label,
    swatch: THEMES[name].swatch,
  }));

export const DEFAULT_THEME: ThemeName = 'blue';
export const DEFAULT_MODE: ThemeMode = 'system';

/** All token channel values for a given theme + scheme. */
export function getTokens(
  name: ThemeName,
  scheme: ColorScheme
): Record<TokenName, string> {
  return { ...NEUTRALS[scheme], ...THEMES[name].accents[scheme] };
}

/** CSS-variable map for NativeWind's `vars()`. */
export function buildVars(
  name: ThemeName,
  scheme: ColorScheme
): Record<`--color-${TokenName}`, string> {
  const tokens = getTokens(name, scheme);
  const out = {} as Record<`--color-${TokenName}`, string>;
  for (const token of TOKEN_NAMES) {
    out[`--color-${token}`] = tokens[token];
  }
  return out;
}

/** "R G B" channels → a React Native-friendly `rgb(r, g, b)` string. */
export function toRgb(channels: string): string {
  return `rgb(${channels.split(' ').join(', ')})`;
}

/** Resolved palette of usable color strings for imperative props (spinners, etc.). */
export function resolvePalette(
  name: ThemeName,
  scheme: ColorScheme
): Record<TokenName, string> {
  const tokens = getTokens(name, scheme);
  const out = {} as Record<TokenName, string>;
  for (const token of TOKEN_NAMES) {
    out[token] = toRgb(tokens[token]);
  }
  return out;
}
