/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Inter",
          "sans-serif",
        ],
      },
      colors: {
        brand: {
          50: "#f4f7ff",
          100: "#e6edff",
          200: "#c9d6ff",
          300: "#a4b8ff",
          400: "#7b93ff",
          500: "#5b74ff",
          600: "#4558ef",
          700: "#3644c4",
          800: "#2c379a",
          900: "#222a74",
        },
      },
    },
  },
  plugins: [],
};
