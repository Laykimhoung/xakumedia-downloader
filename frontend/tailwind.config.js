/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          black: "#0b0c10",
          dark: "#1f2833",
          red: "#e63946",
          accent: "#ff4d5a",
          white: "#f8f9fa",
        },
      },
    },
  },
  plugins: [],
};
