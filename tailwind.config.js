/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'media',
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
          DEFAULT: '#0f6e56',
          light: '#e1f5ee',
          dark: '#085041'
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
