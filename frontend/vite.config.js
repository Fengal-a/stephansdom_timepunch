import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, 
    proxy: {
      "/auth":     "http://localhost:8000",
      "/users":    "http://localhost:8000",
      "/admin":    "http://localhost:8000",
      "/messages": "http://localhost:8000",
    },
  },
});