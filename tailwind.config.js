/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#2563eb',
          600: '#1d4ed8',
          700: '#1e40af',
        },
        brand: {
          blue: '#0065ff',
          dark: '#0f172a',
          purple: '#6366f1',
          coral: '#f43f5e'
        }
      }
    },
  },
  plugins: [],
}

