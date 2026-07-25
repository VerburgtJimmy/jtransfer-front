<script lang="ts">
  import ComparisonPage from "$lib/components/ComparisonPage.svelte";
  import { LAST_VERIFIED, comparisons } from "$lib/compare/comparisons";
  import { nlSlugForEn } from "$lib/compare/comparisons.nl";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const c = $derived(data.comparison);

  const others = $derived(
    comparisons
      .filter((x) => x.slug !== c.slug)
      .map((x) => ({ slug: x.slug, heading: x.heading })),
  );

  // Only pages with a Dutch counterpart get hreflang; a self-only alternate
  // set would claim a translation that does not exist.
  const nlSlug = $derived(nlSlugForEn(c.slug));
  const alternates = $derived(
    nlSlug
      ? ([
          { locale: "en" as const, path: `/compare/${c.slug}` },
          { locale: "nl" as const, path: `/nl/vergelijken/${nlSlug}` },
        ])
      : [],
  );
</script>

<ComparisonPage
  comparison={c}
  locale="en"
  basePath="/compare"
  homePath="/"
  indexPath="/compare"
  {others}
  lastVerified={LAST_VERIFIED}
  ctaPrimaryHref="/"
  ctaSecondaryHref="/security"
  {alternates}
  altPath={nlSlug ? `/nl/vergelijken/${nlSlug}` : undefined}
/>
