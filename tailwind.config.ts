import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      keyframes: {
        "metas-shimmer": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "metas-float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "metas-glow": {
          "0%, 100%": { opacity: "0.45", transform: "scale(1)" },
          "50%": { opacity: "0.9", transform: "scale(1.02)" },
        },
        "reinicio-danger-glow": {
          "0%, 100%": { opacity: "0.35", transform: "scale(1)" },
          "50%": { opacity: "0.85", transform: "scale(1.06)" },
        },
        "reinicio-shake": {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-4px)" },
          "40%": { transform: "translateX(4px)" },
          "60%": { transform: "translateX(-3px)" },
          "80%": { transform: "translateX(3px)" },
        },
        "pyg-ambient": {
          "0%, 100%": { opacity: "0.5", transform: "scale(1)" },
          "50%": { opacity: "0.85", transform: "scale(1.05)" },
        },
        "pyg-float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
      },
      animation: {
        "metas-shimmer": "metas-shimmer 2.4s ease-in-out infinite",
        "metas-float": "metas-float 3.2s ease-in-out infinite",
        "metas-glow": "metas-glow 2.2s ease-in-out infinite",
        "reinicio-danger-glow": "reinicio-danger-glow 2s ease-in-out infinite",
        "reinicio-shake-once": "reinicio-shake 0.65s ease-in-out 1",
        "pyg-ambient": "pyg-ambient 5s ease-in-out infinite",
        "pyg-ambient-delayed": "pyg-ambient 5.8s ease-in-out infinite",
        "pyg-float": "pyg-float 3.5s ease-in-out infinite",
      },
      colors: {
        brand: {
          red: "#C41E3A",
          "red-dark": "#9E1830",
          "red-light": "#E63946",
          /** Amarillo de referencia: rgb(255, 200, 28) */
          yellow: "#FFC81C",
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
