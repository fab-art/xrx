/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)'
        },
        border: 'var(--border)',
        ink: {
          DEFAULT: 'var(--text)',
          muted: 'var(--muted)'
        },
        brand: {
          DEFAULT: '#1e3a8a',
          light: '#e5ecfb',
          dark: '#152a63'
        },
        gold: {
          DEFAULT: '#c99a2e',
          light: '#faf1dc',
          dark: '#8f6c1c'
        },
        danger: {
          DEFAULT: '#a32d2d',
          light: '#fcebeb',
          dark: '#791f1f'
        },
        warn: {
          DEFAULT: '#854f0b',
          light: '#faeeda',
          dark: '#633806'
        }
      },
      borderRadius: {
        card: '14px'
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}
