// SEO content page - override the app-wide ssr=false so this renders to real
// HTML at build time (crawlers + social scrapers see content, not a shell).
export const ssr = true;
export const prerender = true;
