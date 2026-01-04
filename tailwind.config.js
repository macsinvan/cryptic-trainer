/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./App.tsx",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}",
    "./data/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Merriweather', 'serif'],
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        guardian: {
          blue: '#052962',
          lightblue: '#005689',
          yellow: '#ffe500',
          red: '#c70000',
        },
        workflow: {
          def: '#22c55e',
          ind: '#f97316',
          fod: '#3b82f6',
        },
        paper: '#f6f6f6',
      },
      animation: {
        'in': 'animateIn 0.3s ease-out',
      },
      keyframes: {
        animateIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
