import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // bind 0.0.0.0 - required for Codespaces/devcontainer port forwarding
    port: 5174,
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL ?? "http://localhost:4001",
        changeOrigin: true,
      },
      "/storage": {
        target: process.env.VITE_API_URL ?? "http://localhost:4001",
        changeOrigin: true,
      },
    },
  },
});
