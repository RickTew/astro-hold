import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'esnext',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        // Main app entry. Standard.
        main: 'index.html',
        // Sandbox / sound test / production preview page. Lives in the
        // build graph (not /public/) so it can import production classes
        // from /src/* in both dev and production builds.
        buildTest: 'build-test.html',
        // Audio vocal audit. Lists every SFX sample (from POOLS in sfx.ts)
        // with play + duration so stray Suno vocals can be flagged in one pass.
        audioTest: 'audio-test.html',
      },
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/three')) return 'three'
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
})
