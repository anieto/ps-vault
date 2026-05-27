/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,ts}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--color-background)",
        surface: "var(--color-surface)",
        "surface-muted": "var(--color-surface-muted)",
        border: "var(--color-border)",
        "text-primary": "var(--color-text-primary)",
        "text-secondary": "var(--color-text-secondary)",
        "text-muted": "var(--color-text-muted)",
        navy: {
          DEFAULT: "#1e3a5f",
          50: "#eef3f9",
          100: "#d5e3f0",
          600: "#1e3a5f",
          700: "#162c48",
          800: "#0f1f33",
          900: "#091525",
        },
        primary: {
          DEFAULT: "#3b6cbf",
          50: "#eff4ff",
          100: "#dbe8ff",
          500: "#3b6cbf",
          600: "#2d5299",
          700: "#1e3a5f",
        },
        accent: {
          DEFAULT: "#d97706",
          50: "#fffbeb",
          100: "#fef3c7",
          500: "#f59e0b",
          600: "#d97706",
        },
        success: {
          DEFAULT: "#6daa8f",
          50: "#f0faf5",
          700: "#4a8a6f",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        base: ["16px", { lineHeight: "1.6" }],
      },
      borderRadius: {
        lg: "0.625rem",
        md: "0.5rem",
        sm: "0.375rem",
      },
      boxShadow: {
        card: "0 1px 4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        "card-hover": "0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)",
      },
    },
  },
};
