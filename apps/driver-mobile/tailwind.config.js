/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,ts,jsx,tsx}', './src/**/*.{js,ts,jsx,tsx}', './app/**/*.{js,ts,jsx,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Semantic color tokens. Values come from CSS variables applied at runtime
      // by the ThemeProvider (see src/theme). `<alpha-value>` keeps Tailwind
      // opacity modifiers (e.g. bg-primary/20) working.
      colors: {
        background: 'rgb(var(--color-background) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        card: 'rgb(var(--color-card) / <alpha-value>)',
        foreground: 'rgb(var(--color-foreground) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        input: 'rgb(var(--color-input) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          foreground: 'rgb(var(--color-primary-foreground) / <alpha-value>)',
          muted: 'rgb(var(--color-primary-muted) / <alpha-value>)',
          'muted-foreground':
            'rgb(var(--color-primary-muted-foreground) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};
