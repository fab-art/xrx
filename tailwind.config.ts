import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

// Tailwind v4 is CSS-first (see src/index.css `@theme`), so this file only
// wires up the `tailwindcss-animate` plugin — content is auto-detected by
// @tailwindcss/vite from the source files.
const config: Config = {
  darkMode: "class",
  plugins: [tailwindcssAnimate],
};
export default config;
