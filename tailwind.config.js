/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1d4ed8",
          soft: "#dbeafe",
          deep: "#1e3a8a",
        },
        surface: {
          page: "#f3f4f6",
          panel: "#ffffff",
          muted: "#f8fafc",
          dark: "#0f172a",
        },
        border: {
          soft: "#e2e8f0",
          strong: "#cbd5e1",
        },
        text: {
          DEFAULT: "#0f172a",
          muted: "#475569",
          subtle: "#64748b",
          invert: "#f8fafc",
        },
        success: {
          DEFAULT: "#16a34a",
          soft: "#dcfce7",
        },
        warning: {
          DEFAULT: "#d97706",
          soft: "#fef3c7",
        },
        danger: {
          DEFAULT: "#dc2626",
          soft: "#fee2e2",
        },
        info: {
          DEFAULT: "#0891b2",
          soft: "#cffafe",
        },
      },
      spacing: {
        nav: "4.5rem",
        sidebar: "18rem",
        content: "1.5rem",
      },
      boxShadow: {
        panel: "0 26px 70px rgba(15, 23, 42, 0.08)",
        card: "0 14px 36px rgba(15, 23, 42, 0.06)",
      },
      borderRadius: {
        shell: "1.5rem",
      },
    },
  },
  plugins: [],
};
