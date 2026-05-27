/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,ts}"],
  theme: {
    extend: {
      colors: {
        background: "#F9F8F6",
        surface: "#FFFFFF",
        "surface-muted": "#F3F2F0",
        border: "#E8E6E1",
        "text-primary": "#1A1917",
        "text-secondary": "#6B6760",
        "text-muted": "#9C9890",
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
