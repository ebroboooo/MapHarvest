import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#07111a",
          900: "#0c1a26",
          800: "#132536",
          700: "#1c3449",
        },
        tide: {
          300: "#7dccc0",
          400: "#3db8a6",
          500: "#1f9a88",
          600: "#167a6c",
          700: "#115e54",
        },
        sand: {
          50: "#f6f3ec",
          100: "#ebe5d6",
          200: "#d9cfb8",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        panel: "0 18px 50px -28px rgba(7, 17, 26, 0.55)",
      },
    },
  },
  plugins: [],
};

export default config;
