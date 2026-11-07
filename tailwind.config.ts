import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: { DEFAULT: "#0F3D2E", 50: "#EEF5F1", 100: "#D6E8DE", 200: "#A9CDB9", 700: "#14513C", 800: "#0F3D2E", 900: "#0A2C21", 950: "#06201A" },
        emerald: { DEFAULT: "#1F7A5A", 50: "#E8F5EF", 100: "#C8E8D9", 500: "#2A9470", 600: "#1F7A5A", 700: "#18624A" },
        gold: { DEFAULT: "#B8975A", 50: "#FAF5EA", 100: "#F1E6CC", 300: "#D9C089", 500: "#B8975A", 600: "#9C7D44", 700: "#7C6234" },
        ivory: { DEFAULT: "#FAF6EC", 50: "#FDFBF6", 100: "#F6F0E0", 200: "#EBE2CB" },
        charcoal: { DEFAULT: "#232827", 600: "#454B49", 500: "#5F6563", 400: "#868C89", 300: "#B3B6B1", 200: "#DBD6C7", 100: "#ECE8DC" },
        line: "#E6E1D1",
      },
      fontFamily: {
        display: ["Georgia", "'Iowan Old Style'", "'Palatino Linotype'", "serif"],
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "'Segoe UI'", "Roboto", "sans-serif"],
      },
      boxShadow: { card: "0 1px 1px rgba(15,61,46,.04), 0 2px 12px rgba(15,61,46,.05)", lift: "0 8px 30px rgba(15,61,46,.12)", pop: "0 20px 60px rgba(6,32,26,.28)" },
      keyframes: { sheet: { from: { opacity: "0", transform: "translateY(24px)" }, to: { opacity: "1", transform: "none" } }, fade: { from: { opacity: "0" }, to: { opacity: "1" } }, toast: { from: { opacity: "0", transform: "translateY(-8px) scale(.97)" }, to: { opacity: "1", transform: "none" } } },
      animation: { sheet: "sheet .22s cubic-bezier(.2,.8,.2,1)", fade: "fade .15s ease-out", toast: "toast .2s ease-out" },
    },
  },
  plugins: [],
};
export default config;
