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
        charcoal: { DEFAULT: "#2B2F2E", 600: "#4A504E", 500: "#656B69", 400: "#8A908E", 300: "#B6BAB8", 200: "#DADCDA", 100: "#ECEDEC" },
      },
      fontFamily: {
        display: ["Georgia", "'Iowan Old Style'", "'Palatino Linotype'", "serif"],
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "'Segoe UI'", "Roboto", "sans-serif"],
      },
      boxShadow: { card: "0 1px 2px rgba(15,61,46,.05), 0 4px 16px rgba(15,61,46,.05)" },
    },
  },
  plugins: [],
};
export default config;
