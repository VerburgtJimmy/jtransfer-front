// The homepage is the primary SEO target, so it renders to real HTML at build
// time rather than shipping an empty shell. The upload flow itself is
// client-only and starts after hydration. Overrides the app-wide ssr=false.
export const ssr = true;
export const prerender = true;
