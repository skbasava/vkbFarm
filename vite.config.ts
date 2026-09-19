import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const persistencePath = process.env.VKB_E2E_PERSIST_TO;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare(persistencePath ? { persistState: { path: persistencePath } } : {}),
  ],
});
