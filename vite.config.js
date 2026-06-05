import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" produces relative asset paths so the built site works on
// GitHub Pages project sites, Netlify, Vercel, or any static host without
// needing to know the repository name at build time.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
