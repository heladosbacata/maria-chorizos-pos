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
        "cliente-frec-modal-in": {
          "0%": { opacity: "0", transform: "scale(0.92) translateY(16px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        "cliente-frec-backdrop-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "posgeb-backdrop-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "posgeb-card-3d": {
          "0%": { opacity: "0", transform: "perspective(1200px) rotateX(8deg) translateY(24px) scale(0.96)" },
          "100%": { opacity: "1", transform: "perspective(1200px) rotateX(0deg) translateY(0) scale(1)" },
        },
        "posgeb-card-inner": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "posgeb-icon-ring": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.9" },
          "50%": { transform: "scale(1.08)", opacity: "1" },
        },
        "posgeb-icon-glow": {
          "0%, 100%": { opacity: "0.35", transform: "scale(1)" },
          "50%": { opacity: "0.65", transform: "scale(1.12)" },
        },
        "posgeb-orb-a": {
          "0%, 100%": { transform: "translate(0,0) scale(1)" },
          "50%": { transform: "translate(12px,-10px) scale(1.05)" },
        },
        "posgeb-orb-b": {
          "0%, 100%": { transform: "translate(0,0) scale(1)" },
          "50%": { transform: "translate(-16px,8px) scale(1.08)" },
        },
        "posgeb-orb-c": {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "0.85" },
        },
        "posgeb-demo-tap": {
          "0%, 100%": { transform: "scale(1)" },
          "35%": { transform: "scale(0.92)" },
          "55%": { transform: "scale(1)" },
        },
        "posgeb-demo-ripple": {
          "0%": { transform: "scale(0.35)", opacity: "0.85" },
          "100%": { transform: "scale(1.75)", opacity: "0" },
        },
        /** Banner premium landing pedidos (club de millas) */
        "pedidos-club-gradient": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "pedidos-club-shimmer": {
          "0%": { transform: "translateX(-130%) skewX(-14deg)", opacity: "0" },
          "12%": { opacity: "0.55" },
          "100%": { transform: "translateX(200%) skewX(-14deg)", opacity: "0" },
        },
        "pedidos-club-border-glow": {
          "0%, 100%": { boxShadow: "0 0 0 1px rgba(250, 204, 21, 0.35), 0 0 28px rgba(168, 85, 247, 0.25)" },
          "50%": { boxShadow: "0 0 0 1px rgba(253, 224, 71, 0.65), 0 0 40px rgba(236, 72, 153, 0.35)" },
        },
        /** Overlay motivación — cambio de estado pedido (landing /pedidos) */
        "pedidos-estado-motiv-pop": {
          "0%": { opacity: "0", transform: "scale(0.88) translateY(28px)" },
          "58%": { opacity: "1", transform: "scale(1.06) translateY(0)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        "pedidos-estado-motiv-halo": {
          "0%, 100%": { opacity: "0.35", transform: "scale(1)" },
          "50%": { opacity: "0.75", transform: "scale(1.12)" },
        },
        "pedidos-estado-tarjeta-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(6, 182, 212, 0)" },
          "40%": { boxShadow: "0 0 0 6px rgba(6, 182, 212, 0.35)" },
        },
        "liga-cumple-ring": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "liga-cumple-glow": {
          "0%, 100%": { opacity: "0.55", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.06)" },
        },
        "liga-cumple-sparkle": {
          "0%, 100%": { opacity: "0.2", transform: "translateY(0)" },
          "50%": { opacity: "0.9", transform: "translateY(-4px)" },
        },
        "liga-cumple-3d-tilt": {
          "0%, 100%": { transform: "perspective(900px) rotateY(-12deg) rotateX(5deg) scale(1)" },
          "50%": { transform: "perspective(900px) rotateY(12deg) rotateX(-5deg) scale(1.04)" },
        },
        "liga-cumple-halo": {
          "0%, 100%": { opacity: "0.35", transform: "scale(0.95)" },
          "50%": { opacity: "0.75", transform: "scale(1.08)" },
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
        "cliente-frec-modal-in": "cliente-frec-modal-in 0.45s cubic-bezier(0.16, 1, 0.3, 1) both",
        "cliente-frec-backdrop-in": "cliente-frec-backdrop-in 0.3s ease-out both",
        "posgeb-backdrop-in": "posgeb-backdrop-in 0.5s ease-out both",
        "posgeb-card-3d": "posgeb-card-3d 0.75s cubic-bezier(0.16, 1, 0.3, 1) both",
        "posgeb-card-inner": "posgeb-card-inner 0.55s ease-out 0.12s both",
        "posgeb-icon-ring": "posgeb-icon-ring 2.4s ease-in-out infinite",
        "posgeb-icon-glow": "posgeb-icon-glow 2.4s ease-in-out infinite",
        "posgeb-orb-a": "posgeb-orb-a 8s ease-in-out infinite",
        "posgeb-orb-b": "posgeb-orb-b 9s ease-in-out infinite",
        "posgeb-orb-c": "posgeb-orb-c 5s ease-in-out infinite",
        "posgeb-demo-tap": "posgeb-demo-tap 1.35s ease-in-out infinite",
        "posgeb-demo-ripple": "posgeb-demo-ripple 1.35s ease-out infinite",
        "pedidos-club-gradient": "pedidos-club-gradient 10s ease-in-out infinite",
        "pedidos-club-shimmer": "pedidos-club-shimmer 4.2s ease-in-out infinite",
        "pedidos-club-border-glow": "pedidos-club-border-glow 3.5s ease-in-out infinite",
        "pedidos-estado-motiv-pop": "pedidos-estado-motiv-pop 0.75s cubic-bezier(0.22, 1, 0.36, 1) both",
        "pedidos-estado-motiv-halo": "pedidos-estado-motiv-halo 2.2s ease-in-out infinite",
        "pedidos-estado-tarjeta-pulse": "pedidos-estado-tarjeta-pulse 1.15s ease-out 1",
        "liga-cumple-ring": "liga-cumple-ring 4s linear infinite",
        "liga-cumple-glow": "liga-cumple-glow 2.4s ease-in-out infinite",
        "liga-cumple-sparkle": "liga-cumple-sparkle 2s ease-in-out infinite",
        "liga-cumple-3d-tilt": "liga-cumple-3d-tilt 5.5s ease-in-out infinite",
        "liga-cumple-halo": "liga-cumple-halo 3s ease-in-out infinite",
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
