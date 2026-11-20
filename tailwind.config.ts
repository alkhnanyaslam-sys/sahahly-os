import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/config/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sky: {
          50: "#F0F9FF",
          100: "#E0F2FE",
          200: "#BAE6FD",
          300: "#7DD3FC",
          400: "#38BDF8",
          500: "#0EA5E9",
          600: "#0284C7",
          700: "#0369A1",
          800: "#075985",
          900: "#0C4A6E",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F8FAFC",
        },
        line: {
          DEFAULT: "#E2E8F0",
          strong: "#CBD5E1",
        },
        ink: {
          DEFAULT: "#0F172A",
          soft: "#334155",
          muted: "#64748B",
        },
        success: {
          50: "#F0FDF4",
          100: "#DCFCE7",
          600: "#16A34A",
          700: "#15803D",
        },
        danger: {
          50: "#FEF2F2",
          100: "#FEE2E2",
          600: "#DC2626",
          700: "#B91C1C",
        },
        warning: {
          50: "#FFFBEB",
          100: "#FEF3C7",
          600: "#D97706",
          700: "#B45309",
        },
      },
      fontFamily: {
        sans: ["var(--font-cairo)", "Tajawal", "system-ui", "sans-serif"],
        display: ["var(--font-cairo)", "Tajawal", "system-ui", "sans-serif"],
        latin: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "0.75rem",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(15, 23, 42, 0.04)",
        pop: "0 4px 12px -2px rgba(15, 23, 42, 0.08)",
      },
      maxWidth: {
        page: "80rem",
      },
    },
  },
  plugins: [],
};

export default config;
