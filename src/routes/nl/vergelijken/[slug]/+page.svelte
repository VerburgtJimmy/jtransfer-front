<script lang="ts">
  import ComparisonPage from "$lib/components/ComparisonPage.svelte";
  import { LAST_VERIFIED_NL, comparisonsNl } from "$lib/compare/comparisons.nl";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const c = $derived(data.comparison);

  const others = $derived(
    comparisonsNl
      .filter((x) => x.slug !== c.slug)
      .map((x) => ({ slug: x.slug, heading: x.heading })),
  );

  const alternates = $derived([
    { locale: "en" as const, path: `/compare/${c.enSlug}` },
    { locale: "nl" as const, path: `/nl/vergelijken/${c.slug}` },
  ]);
</script>

<ComparisonPage
  comparison={c}
  locale="nl"
  basePath="/nl/vergelijken"
  homePath="/"
  {others}
  lastVerified={LAST_VERIFIED_NL}
  ctaPrimaryHref="/"
  ctaSecondaryHref="/security"
  {alternates}
  altPath={`/compare/${c.enSlug}`}
/>
