import { error } from "@sveltejs/kit";
import { comparisons, getComparison } from "$lib/compare/comparisons";
import type { PageLoad, EntryGenerator } from "./$types";

// SEO content pages - render to real static HTML at build time (override the
// app-wide ssr=false). entries() lists every slug so all pages prerender.
export const ssr = true;
export const prerender = true;

export const entries: EntryGenerator = () =>
  comparisons.map((c) => ({ slug: c.slug }));

export const load: PageLoad = ({ params }) => {
  const comparison = getComparison(params.slug);
  if (!comparison) error(404, "Comparison not found");
  return { comparison };
};
