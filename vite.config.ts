import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// base: './' にしているので、Firebase Hosting でも GitHub Pages のサブフォルダでも動きます。
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
