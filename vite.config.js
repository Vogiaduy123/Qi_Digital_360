import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiPort = env.PORT || '3000';
  const apiTarget = `http://localhost:${apiPort}`;

  return {
  root: 'src',
  publicDir: '../public',
  server: {
    port: 5173,
    proxy: {
      '/api': apiTarget,
      '/events': apiTarget,
      '/uploads': apiTarget
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html')
      }
    }
  }
};
});
