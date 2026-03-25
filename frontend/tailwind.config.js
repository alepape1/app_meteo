/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:  ['"DM Sans"',          'system-ui', 'sans-serif'],
        serif: ['"DM Serif Display"', 'Georgia',   'serif'],
      },
      colors: {
        brand: {
          50:  '#dff1fb',
          100: '#b8dff5',
          300: '#5ab4e0',
          500: '#0c8ecc',
          600: '#0a7ab0',
          700: '#08699a',
        },
        navy: {
          50:  '#edf1f6',
          100: '#d0dce8',
          200: '#a5b8cb',
          300: '#8a9aaa',
          500: '#3d506a',
          700: '#1a3350',
          800: '#011f42',
          900: '#012d5c',
        },
      },
    },
  },
  plugins: [],
}
