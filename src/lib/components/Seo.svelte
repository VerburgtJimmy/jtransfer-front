<script lang="ts">
  import { SITE_URL } from "$lib/config/site";

  // Per-page head tags. Every route renders exactly one of these: app.html
  // holds only tags that never vary, so the first <title> in document order is
  // always the route's own.
  const INDEXABLE =
    "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1";
  const NOINDEX = "noindex, nofollow, noarchive, nosnippet";

  let {
    title,
    description = "",
    path = "",
    robots = "index",
  }: {
    title: string;
    description?: string;
    /** Absolute path, e.g. "/privacy". Emits canonical + og:url. Omit on noindex routes. */
    path?: string;
    robots?: "index" | "noindex";
  } = $props();

  const robotsContent = $derived(robots === "noindex" ? NOINDEX : INDEXABLE);
  const canonical = $derived(path ? `${SITE_URL}${path}` : "");
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="robots" content={robotsContent} />
  <meta property="og:title" content={title} />
  <meta name="twitter:title" content={title} />
  {#if description}
    <meta name="description" content={description} />
    <meta property="og:description" content={description} />
    <meta name="twitter:description" content={description} />
  {/if}
  {#if canonical}
    <link rel="canonical" href={canonical} />
    <meta property="og:url" content={canonical} />
  {/if}
</svelte:head>
