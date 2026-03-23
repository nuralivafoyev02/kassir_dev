import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import { cloudflare } from "@cloudflare/vite-plugin"

export default defineConfig({
  plugins: [vue(), cloudflare()],
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
})
