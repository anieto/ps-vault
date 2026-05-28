/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // P.S. Vault palette — mirrors web app
        primary: {
          DEFAULT: '#5B7FA6',
          foreground: '#FFFFFF',
        },
        accent: {
          DEFAULT: '#D4923A',
          foreground: '#1A1A1A',
        },
        background: '#F9F8F6',
        surface: '#EFEDE8',
        destructive: {
          DEFAULT: '#C0636A',
          foreground: '#FFFFFF',
        },
        success: '#6B9E7A',
        warning: '#D4923A',
        border: '#D8D4CC',
        'text-primary': '#2C2A28',
        'text-secondary': '#6B6560',
        // Dark mode equivalents
        'dark-bg': '#1C1B19',
        'dark-surface': '#252420',
        'dark-border': '#3A3830',
        'dark-text-primary': '#F0EDE8',
        'dark-text-secondary': '#9A9490',
      },
    },
  },
  darkMode: 'class',
  plugins: [],
};
