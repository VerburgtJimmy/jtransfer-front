<script lang="ts">
  import PageLayout from "$lib/components/PageLayout.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import SiteFooter from "$lib/components/SiteFooter.svelte";
  import { comparisons } from "$lib/compare/comparisons";
  // Title / description / OG / canonical are set site-wide by the app.html
  // pageMeta script ("/compare" is registered there).
</script>

<PageLayout width="5xl">
  <PageHeader
    title="How Tessil compares"
    tagline="Tessil is end-to-end encrypted file transfer: your browser encrypts before upload, and the key never reaches our servers. Here's how that stacks up against the tools people use today."
  />

  <ul class="grid gap-4 sm:grid-cols-2">
    {#each comparisons as c (c.slug)}
      <li>
        <a
          href="/compare/{c.slug}"
          class="group block h-full rounded-xl border border-border bg-card/60 p-5 transition-[border-color,background-color] duration-200 ease-out hover:border-border hover:bg-card focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <h2 class="text-lg font-semibold text-foreground">
            {c.heading}
          </h2>
          <p class="mt-1.5 text-sm text-muted-foreground leading-relaxed">
            {c.summary}
          </p>
          <span class="mt-3 inline-block text-sm font-medium text-primary underline underline-offset-2">
            Read the comparison →
          </span>
        </a>
      </li>
    {/each}
  </ul>

  <p class="mt-10 text-sm text-muted-foreground">
    New to Tessil? <a href="/" class="text-primary underline underline-offset-2">Send a file</a>
 - no account needed - or read the
    <a href="/security" class="text-primary underline underline-offset-2">security overview</a>.
  </p>

  <SiteFooter />
</PageLayout>
