import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the same build works on GitHub Pages (/<repo>/),
  // Cloudflare Pages (/), or a plain file server.
  base: './',
  build: {
    target: 'es2022',
    // The LLM + speech runtimes are large; don't inline or warn about them.
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      output: {
        manualChunks: {
          webllm: ['@mlc-ai/web-llm'],
          transformers: ['@huggingface/transformers'],
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    headers: {
      // Harmless locally; GitHub Pages cannot send these, so the app is written
      // to work single-threaded without SharedArrayBuffer.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
});
