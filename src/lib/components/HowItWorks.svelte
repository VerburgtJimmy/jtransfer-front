<script lang="ts">
  import { cn } from "$lib/utils";
  import { howItWorksStrings } from "$lib/i18n/messages";
  import type { Locale } from "$lib/i18n/locale";

  type Props = {
    class?: string;
    locale?: Locale;
  };

  let { class: className = "", locale = "en" }: Props = $props();

  const t = $derived(howItWorksStrings[locale]);
</script>

<section
  class={cn(
    "mt-12 pt-10 border-t border-border/60 space-y-6",
    className,
  )}
  aria-labelledby="how-it-works-title"
>
  <h2 id="how-it-works-title" class="text-base font-semibold text-foreground">
    {t.heading}
  </h2>

  <ol class="space-y-5">
    {#each t.steps as step, i (i)}
      <li class="flex gap-4">
        <span
          class="flex-shrink-0 inline-flex items-center justify-center size-7 rounded-full bg-primary/10 text-primary text-sm font-semibold tabular-nums"
          aria-hidden="true"
        >
          {i + 1}
        </span>
        <div class="space-y-1">
          <p class="text-sm font-medium text-foreground">{step.action}</p>
          <p class="text-sm text-muted-foreground">{step.transparency}</p>
        </div>
      </li>
    {/each}
  </ol>
</section>
