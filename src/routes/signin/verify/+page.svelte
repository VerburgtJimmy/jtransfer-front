<script lang="ts">
  // Landing page for the emailed sign-in link. The token arrives in the URL
  // fragment, so it is never sent to the server by the click itself and cannot
  // be consumed by a mail scanner prefetching the URL. This page reads it and
  // POSTs it to the API.
  import { goto } from "$app/navigation";
  import { api } from "$lib/api/client";
  import Alert from "$lib/components/Alert.svelte";
  import Button from "$lib/components/Button.svelte";
  import * as Frame from "$lib/components/frame";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import PageLayout from "$lib/components/PageLayout.svelte";
  import Spinner from "$lib/components/Spinner.svelte";
  import { auth } from "$lib/stores/auth.svelte";
  import { onMount } from "svelte";

  let failed = $state(false);

  onMount(() => {
    const fragment = window.location.hash.replace(/^#/, "");
    const token = new URLSearchParams(fragment).get("token");

    // Strip the fragment so Back/Forward, screenshots, or a shared tab cannot
    // re-expose the token.
    history.replaceState(null, "", window.location.pathname);

    if (!token) {
      failed = true;
      return;
    }

    void redeem(token);
  });

  async function redeem(token: string) {
    try {
      const result = await api.verifyMagicLink(token);

      if (result.action === "code_issued" && result.code) {
        // Opened on a different device. Hand the code to /signin/code via the
        // fragment, matching what the old GET redirect did.
        const params = new URLSearchParams({
          code: result.code,
          exp: String(result.expiresIn ?? 0),
        });
        await goto(`/signin/code#${params.toString()}`, { replaceState: true });
        return;
      }

      await auth.refresh();
      await goto("/dashboard", { replaceState: true });
    } catch {
      // Consumed, expired, and not-found are deliberately indistinguishable.
      failed = true;
    }
  }
</script>

<svelte:head>
  <title>Signing you in - Tessil</title>
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />
</svelte:head>

<PageLayout>
  <PageHeader
    title={failed ? "This link didn't work" : "Signing you in"}
    tagline={failed
      ? "Sign-in links are single use and valid for 15 minutes."
      : "One moment while we check your sign-in link."}
  />

  <Frame.Root>
    <Frame.Panel>
      {#if failed}
        <Alert tone="warning" title="Request a fresh link">
          This link has already been used, has expired, or is incomplete. Ask
          for a new one and open it on the same device you requested it from.
          {#snippet action()}
            <Button variant="secondary" fullWidth={false} href="/login">
              Back to sign-in
            </Button>
          {/snippet}
        </Alert>
      {:else}
        <div
          class="flex items-center justify-center gap-3 py-8 text-muted-foreground"
          aria-live="polite"
        >
          <Spinner />
          <span>Checking your link</span>
        </div>
      {/if}
    </Frame.Panel>
  </Frame.Root>
</PageLayout>
