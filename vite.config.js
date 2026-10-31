import { defineConfig } from 'vite'

export default defineConfig({
  base: '/outcome-memories-2.5d/',
  assetsInclude: ['**/*.dae', '**/*.obj', '**/*.mtl', '**/*.glb', '**/*.gltf'],
  server: {
    // Online play during development: `npm run server` listens on 8788 and the
    // Vite dev server forwards websocket traffic to it.
    proxy: {
      '/ws': {
        target: 'ws://localhost:8788',
        ws: true
      }
    }
  }
})
