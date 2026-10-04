import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // dev: proxy /api to the local backend so the app uses same-origin relative paths
    proxy: { "/api": "http://localhost:8000" },
  },
});
