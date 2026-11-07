import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import {localRequestAllowed} from './lib/local-loopback';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'DLOOP_');
  const local=env.DLOOP_ACCESS_MODE==='LOCAL_SINGLE_USER';
  const bridge=env.DLOOP_LOCAL_BRIDGE_TOKEN;
  if(local&&(!bridge||!(/^[a-f0-9]{64}$/.test(bridge))))throw Error('Private local bridge token required. Use the local launcher.');
  const origins=['http://localhost:5173','http://127.0.0.1:5173'];
  const localGuard=()=>({name:'dloop-local-loopback',configureServer(server:any){server.middlewares.use((req:any,res:any,next:any)=>{
    if(!localRequestAllowed(req.socket.remoteAddress,req.headers,origins)){res.statusCode=403;res.end('Local access denied');return;}
    // Never accept a bridge credential supplied by the browser.
    delete req.headers['x-dloop-local-bridge'];next();
  });}});
  return {
    plugins: [react(),...(local?[localGuard()]:[])],
    resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
    server: {
      host: '127.0.0.1',
      watch: { ignored: ['**/work/**', '**/backend/**', '**/backups/**', '**/captures/**'] },
      fs: { deny: ['.env', '.env.*', '**/config.local.php', '**/.tools/**', '**/backend/**', '**/.dev.vars*', '**/*secrets*.h', '**/*.pem', '**/.git/**', '**/backups/**', '**/legacy/**', '**/work/**', '**/.wrangler/**', '**/.sites-runtime/**', '**/.next/**', '**/.vinext/**'] },
      ...(env.DLOOP_API_PROXY ? { proxy: { '/api': { target: env.DLOOP_API_PROXY, changeOrigin: false,...(local?{headers:{'X-DLoop-Local-Bridge':bridge}}:{}) } } } : {}),
    },
    build: { outDir: 'dist', sourcemap: false },
  };
});
