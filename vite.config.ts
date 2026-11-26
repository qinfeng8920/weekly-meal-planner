import {defineConfig} from 'vite';

export default defineConfig({
  base:'./',
  build:{rollupOptions:{output:{manualChunks(id){
    if(id.includes('/node_modules/zod/'))return 'validation';
    if(/\/node_modules\/(react|react-dom|scheduler)\//.test(id))return 'react';
  }}}},
});
