import type { Handle } from "@sveltejs/kit";
import { HTML_LANG, localeFromPath } from "$lib/i18n/locale";

// The lang attribute lives on <html>, outside the Svelte tree, so a component
// cannot set it. This runs during prerendering too, so each prerendered page
// gets the right value baked into its static HTML.
//
// Client-side navigation between locales does not re-run this. That is fine
// while Dutch exists only on prerendered content pages, which are full page
// loads from search. Revisit if the app itself becomes localised.
export const handle: Handle = async ({ event, resolve }) => {
  const lang = HTML_LANG[localeFromPath(event.url.pathname)];
  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace("%tessil.lang%", lang),
  });
};
