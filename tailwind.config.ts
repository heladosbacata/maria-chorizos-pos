import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          red: "#C41E3A",
          "red-dark": "#9E1830",
          "red-light": "#E63946",
          white: "#FFFFFF",
        },
        primary: {
          50: "#FEF2F3",
          100: "#FEE2E4",
          200: "#FECACD",
          300: "#FDA4A9",
          400: "#F87178",
          500: "#C41E3A",
          600: "#9E1830",
          700: "#B91C1C",
          800: "#991B1B",
          900: "#7F1D1D",
          950: "#450A0A",
        },
      },
    },
  },
  plugins: [],
};

export default config;
