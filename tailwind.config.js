/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          green: '#183D32',
          greenLight: '#235344',
          cream: '#FFF8ED',
          gold: '#D9A441',
          terracotta: '#B85C38',
          charcoal: '#252B29',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Manrope', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 10px -2px rgba(24, 61, 50, 0.06), 0 1px 3px rgba(37, 43, 41, 0.05)',
        elevated: '0 10px 30px -8px rgba(24, 61, 50, 0.14)',
      },
    },
  },
  plugins: [],
};
