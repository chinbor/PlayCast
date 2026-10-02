import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  base: './',
  plugins: [react(), UnoCSS(), {
    name: 'development-csp',
    transformIndexHtml(html, context) {
      return context.server ? html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'") : html
    }
  }],
  server: { port: 5188, strictPort: true }
})
