import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        target: 'es2020',
        minify: 'terser',
        terserOptions: {
            compress: {
                drop_console: false, // Keep console logs for portfolio terminal
                drop_debugger: true,
            },
        },
        rollupOptions: {
            output: {
                manualChunks: {
                    three: ['three'],
                    gsap: ['gsap'],
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
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        },
    },
});
