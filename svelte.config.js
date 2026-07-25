import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			fallback: 'index.html'
		}),

		// Script policy only; every other directive is the nginx header
		// (tessil-api/infra/nginx/snippets/security-headers.conf). `hash` pins
		// SvelteKit's inline bootstrap, whose hash changes per build, so
		// 'unsafe-inline' is ignored and injected inline scripts cannot run.
		// wasm-unsafe-eval is for hash-wasm (Argon2id) at vault unlock.
		csp: {
			mode: 'hash',
			directives: {
				'script-src': ['self', 'wasm-unsafe-eval']
			}
		}
	}
};

export default config;
