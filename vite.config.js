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
        chunkSizeWarningLimit: 600, // Three.js alone is ~565 KB
        sourcemap: false,
    },
    server: {
        open: true,
        host: true,
    },
});
