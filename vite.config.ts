import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 4173,
    host: "0.0.0.0"
  }
});
