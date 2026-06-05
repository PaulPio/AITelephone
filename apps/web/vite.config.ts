import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname, "../.."),
  server: { port: 5173 },
});
