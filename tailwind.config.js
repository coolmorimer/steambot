/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './index.html',
  ],
  theme: {
    extend: {
      colors: {
        steam: {
          dark:  '#1b2838',
          mid:   '#2a475e',
          light: '#c7d5e0',
          blue:  '#66c0f4',
          green: '#4db86e',
        },
      },
    },
  },
  plugins: [],
};


