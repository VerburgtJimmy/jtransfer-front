// Static content page: render to real HTML at build time so crawlers and link
// unfurlers see it. The v1 redirect to "/" is gone: with Pro deferred the page
// now answers "is this free?" rather than selling a tier, so it earns its URL.
// No auth or API calls remain (the Polar checkout was removed with the rewrite).
export const ssr = true;
export const prerender = true;
