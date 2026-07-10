/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f8f9fb',
          100: '#eef0f4',
          200: '#d8dce6',
          400: '#8a92a6',
          700: '#3a4255',
          900: '#13182a',
        },
        accent: {
          DEFAULT: '#4f46e5',
          soft: '#eef2ff',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
