import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from 'node:url';

const bridge = fileURLToPath(new URL('./src/afterimageBridge.ts', import.meta.url));
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@tauri-apps/api/core': bridge,
      '@tauri-apps/api/event': bridge,
      '@tauri-apps/plugin-dialog': bridge,
    },
  },
});
