import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter var"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        ink: {
          50: '#f7f7f5',
          100: '#efeeea',
          200: '#e2e0d9',
          300: '#c9c6bc',
          400: '#a29f94',
          500: '#7b786e',
          600: '#5b5950',
          700: '#3f3d37',
          800: '#2a2925',
          850: '#22211e',
          900: '#1a1917',
          950: '#121110',
        },
        accent: {
          400: '#f59f6b',
          500: '#e8794a',
          600: '#d0602f',
        },
      },
      keyframes: {
        blink: { '0%, 80%, 100%': { opacity: '0.2' }, '40%': { opacity: '1' } },
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        blink: 'blink 1.4s infinite both',
        'fade-in': 'fade-in 0.2s ease-out',
      },
    },
  },
  plugins: [typography],
};
