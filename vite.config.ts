import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  build: {
    rollupOptions: {
      output: {
        // Bibliotecas mudam pouco: chunks separados ficam em cache entre deploys.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(id)) return 'react'
          if (/node_modules\/@supabase\//.test(id)) return 'supabase'
          if (/node_modules\/(@tanstack|zod|sonner|@radix-ui|lucide-react)\//.test(id)) return 'libs'
          return undefined
        },
      },
    },
  },
})
