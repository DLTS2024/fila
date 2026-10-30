import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'DLOOP_');
  return {
    plugins: [react()],
    resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
    server: {
      host: '127.0.0.1',
      fs: { deny: ['.env', '.env.*', '**/config.local.php', '**/.tools/**', '**/backend/**', '**/.dev.vars*', '**/*secrets*.h', '**/*.pem', '**/.git/**', '**/backups/**', '**/legacy/**', '**/work/**', '**/.wrangler/**', '**/.sites-runtime/**', '**/.next/**', '**/.vinext/**'] },
      ...(env.DLOOP_API_PROXY ? { proxy: { '/api': { target: env.DLOOP_API_PROXY, changeOrigin: false } } } : {}),
    },
    build: { outDir: 'dist', sourcemap: false },
  };
});
