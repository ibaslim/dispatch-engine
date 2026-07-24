/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './apps/tracking-web/src/**/*.{html,ts}',
  ],
  theme: {
    extend: {
      colors: {
        courier: {
          yellow: '#FFC907',
          green: '#5FA13F',
          lime: '#8CC63F',
          ink: '#1D1D1D',
          slate: '#2e3e51',
        },
      },
      fontFamily: {
        display: ['"Lilita One"', 'system-ui', 'sans-serif'],
        body: ['"Nunito Sans"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};