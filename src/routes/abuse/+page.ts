// Static trust page: render to real HTML at build time so crawlers and link
// unfurlers see the content, not the SPA shell. The report form still runs
// client-side after hydration. Overrides the app-wide ssr=false.
export const ssr = true;
export const prerender = true;
