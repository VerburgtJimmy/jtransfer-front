<script lang="ts">
  import PageLayout from "$lib/components/PageLayout.svelte";
  import SiteFooter from "$lib/components/SiteFooter.svelte";
  import Button from "$lib/components/Button.svelte";
  import IconCheckRegular from "phosphor-icons-svelte/IconCheckRegular.svelte";
  import IconXRegular from "phosphor-icons-svelte/IconXRegular.svelte";
  import { LAST_VERIFIED, comparisons } from "$lib/compare/comparisons";
  import type { Cell } from "$lib/compare/comparisons";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const c = $derived(data.comparison);

  const canonical = $derived(`https://tessil.app/compare/${c.slug}`);
  const others = $derived(comparisons.filter((x) => x.slug !== c.slug));

  // Breadcrumb + FAQ structured data, prerendered into the static HTML.
  const jsonLd = $derived(
    JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://tessil.app/" },
            { "@type": "ListItem", position: 2, name: "Compare", item: "https://tessil.app/compare" },
            { "@type": "ListItem", position: 3, name: c.heading, item: canonical },
          ],
        },
        {
          "@type": "FAQPage",
          mainEntity: c.faq.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        },
      ],
    }).replace(/</g, "\\u003c"),
  );
</script>

<svelte:head>
  <!-- Title / description / OG / canonical / robots are set site-wide by the
       app.html pageMeta script (compare routes are registered there), so we
       keep a single consistent set of head tags. Here we only add the
       structured data that script can't provide. -->
  {@html `<script type="application/ld+json">${jsonLd}</script>`}
</svelte:head>

{#snippet cell(v: Cell)}
  {#if typeof v === "boolean"}
    <span class="inline-flex items-center">
      <span class="inline-flex" aria-hidden="true">
        {#if v}
          <IconCheckRegular class="size-5 text-primary" />
        {:else}
          <IconXRegular class="size-5 text-muted-foreground/40" />
        {/if}
      </span>
      <span class="sr-only">{v ? "Yes" : "No"}</span>
    </span>
  {:else}
    <span class="text-sm">{v}</span>
  {/if}
{/snippet}

<PageLayout width="5xl">
  <nav class="mb-8 text-sm text-muted-foreground" aria-label="Breadcrumb">
    <a href="/" class="hover:text-foreground transition-colors duration-200 ease-out">Home</a>
    <span class="mx-2" aria-hidden="true">/</span>
    <a href="/compare" class="hover:text-foreground transition-colors duration-200 ease-out">Compare</a>
    <span class="mx-2" aria-hidden="true">/</span>
    <span class="text-foreground">{c.shortName}</span>
  </nav>

  <header class="mb-10 max-w-2xl">
    <h1 class="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground" style="letter-spacing: -0.02em">
      {c.heading}
    </h1>
    <p class="mt-3 text-lg text-muted-foreground leading-relaxed">{c.summary}</p>
  </header>

  <div class="prose-tessil max-w-2xl space-y-4 text-muted-foreground leading-relaxed">
    {#each c.intro as paragraph}
      <p>{paragraph}</p>
    {/each}
  </div>

  <!-- Comparison table -->
  <div class="mt-10 overflow-x-auto rounded-xl border border-border bg-card/60">
    <table class="w-full border-collapse text-left">
      <caption class="sr-only">Feature comparison: Tessil versus {c.competitor}</caption>
      <thead>
        <tr class="border-b border-border">
          <th scope="col" class="py-3.5 px-5 text-sm font-medium text-muted-foreground">Feature</th>
          <th scope="col" class="py-3.5 px-5 text-sm font-semibold text-foreground">Tessil</th>
          <th scope="col" class="py-3.5 px-5 text-sm font-medium text-muted-foreground">{c.competitor}</th>
        </tr>
      </thead>
      <tbody>
        {#each c.rows as row (row.label)}
          <tr class="border-b border-border/50 last:border-0">
            <th scope="row" class="py-3.5 px-5 text-sm font-normal text-foreground align-top">
              {row.label}
            </th>
            <td class="py-3.5 px-5 align-top">{@render cell(row.tessil)}</td>
            <td class="py-3.5 px-5 align-top text-muted-foreground">{@render cell(row.competitor)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <p class="mt-3 text-xs text-muted-foreground/80">
    {c.competitor} details last verified {LAST_VERIFIED}. Competitor features and pricing change
    often - check the provider's own site for current details.
  </p>

  <!-- Verdict -->
  <section class="mt-12 max-w-2xl">
    <h2 class="text-xl font-semibold text-foreground">The honest verdict</h2>
    <div class="mt-3 space-y-4 text-muted-foreground leading-relaxed">
      {#each c.verdict as paragraph}
        <p>{paragraph}</p>
      {/each}
    </div>
  </section>

  <!-- CTA -->
  <div class="mt-10 flex flex-wrap items-center gap-3">
    <Button href="/" variant="primary" fullWidth={false}>Send a file with Tessil - free</Button>
    <Button href="/security" variant="secondary" fullWidth={false}>How the encryption works</Button>
  </div>

  <!-- FAQ -->
  <section class="mt-14 max-w-2xl">
    <h2 class="text-xl font-semibold text-foreground">Frequently asked questions</h2>
    <div class="mt-4 divide-y divide-border/60 border-y border-border/60">
      {#each c.faq as item (item.q)}
        <details class="group py-4">
          <summary class="flex cursor-pointer items-center justify-between gap-4 text-foreground font-medium list-none [&::-webkit-details-marker]:hidden">
            {item.q}
            <span class="text-muted-foreground transition-transform duration-200 ease-out group-open:rotate-45" aria-hidden="true">+</span>
          </summary>
          <p class="mt-2 text-muted-foreground leading-relaxed">{item.a}</p>
        </details>
      {/each}
    </div>
  </section>

  <!-- Other comparisons -->
  <section class="mt-14">
    <h2 class="text-sm font-medium text-muted-foreground">More comparisons</h2>
    <ul class="mt-3 flex flex-wrap gap-2">
      {#each others as o (o.slug)}
        <li>
          <a
            href="/compare/{o.slug}"
            class="inline-block rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-sm text-foreground transition-colors duration-200 ease-out hover:bg-card focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {o.heading}
          </a>
        </li>
      {/each}
    </ul>
  </section>

  <SiteFooter />
</PageLayout>
