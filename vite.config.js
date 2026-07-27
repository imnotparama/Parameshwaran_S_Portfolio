import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        target: 'es2020',
        minify: 'esbuild',
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules/three')) return 'three';
                    if (id.includes('node_modules/gsap')) return 'gsap';
                },
            },
        },
        chunkSizeWarningLimit: 500,
        sourcemap: false,
    },
    server: {
        open: true,
        host: true,
    },
});
