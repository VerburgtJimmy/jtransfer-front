import { error } from "@sveltejs/kit";
import { comparisonsNl, getComparisonNl } from "$lib/compare/comparisons.nl";
import type { PageLoad, EntryGenerator } from "./$types";

// Dutch SEO content pages, prerendered to real static HTML like their English
// counterparts. Overrides the app-wide ssr=false.
export const ssr = true;
export const prerender = true;

export const entries: EntryGenerator = () =>
  comparisonsNl.map((c) => ({ slug: c.slug }));

export const load: PageLoad = ({ params }) => {
  const comparison = getComparisonNl(params.slug);
  if (!comparison) error(404, "Vergelijking niet gevonden");
  return { comparison };
};
