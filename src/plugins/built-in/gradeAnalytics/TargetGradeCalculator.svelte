<script lang="ts">
  import { onMount } from "svelte";
  import browser from "@/lib/browser";
  import type { Assessment } from "./types";
  import {
    computeTarget,
    subjectYearAssessments,
    weightLookupFromAveragesCache,
    type WeightLookup,
  } from "./targetGrade";

  interface Props {
    data: Assessment[];
    /** Preselect a subject (Results Drop / assessment pages); wins over saved prefs. */
    initialSubject?: string;
  }

  let { data, initialSubject }: Props = $props();

  const WEIGHTINGS_KEY = "plugin.assessments-average.storage.weightings";
  const OVERRIDES_KEY = "plugin.assessments-average.storage.weightingOverrides";
  const PREFS_KEY = "bsplus.analytics.targetCalc.v1";

  const year = new Date().getFullYear();

  let weightOf: WeightLookup = $state(() => null);
  // svelte-ignore state_referenced_locally
  let subject = $state(initialSubject ?? "");
  let target = $state(75);

  /** Subjects with any assessment this year, most recently active first. */
  const subjects = $derived.by(() => {
    const latest = new Map<string, number>();
    for (const a of data) {
      const t = new Date(a.due).getTime();
      if (new Date(a.due).getFullYear() !== year) continue;
      latest.set(a.subject, Math.max(latest.get(a.subject) ?? 0, t));
    }
    return [...latest.entries()].sort((x, y) => y[1] - x[1]).map(([s]) => s);
  });

  $effect(() => {
    if (!subject && subjects.length) subject = subjects[0];
  });

  const result = $derived(
    subject
      ? computeTarget(subjectYearAssessments(data, subject, year), subject, target, weightOf)
      : null,
  );

  const fmt = (n: number | null | undefined) => (n == null ? "–" : `${n.toFixed(1)}%`);

  const verdictText: Record<string, string> = {
    "locked-in": "Locked in",
    "on-track": "On track",
    stretch: "Stretch",
    impossible: "Not possible",
    "no-remaining": "All marked",
  };

  onMount(async () => {
    try {
      const got = await browser.storage.local.get([WEIGHTINGS_KEY, OVERRIDES_KEY, PREFS_KEY]);
      weightOf = weightLookupFromAveragesCache(
        got[WEIGHTINGS_KEY] as Record<string, { weight?: string }> | undefined,
        got[OVERRIDES_KEY] as Record<string, string> | undefined,
      );
      const prefs = got[PREFS_KEY] as { subject?: string; target?: number } | undefined;
      if (prefs?.target != null) target = prefs.target;
      if (prefs?.subject && !initialSubject) subject = prefs.subject;
    } catch {
      /* fall back to equal weights */
    }
  });

  function savePrefs() {
    void browser.storage.local.set({ [PREFS_KEY]: { subject, target } });
  }
</script>

<article class="bsplus-analytics-card bsplus-target-card">
  <header class="bsplus-analytics-card-header bsplus-analytics-card-header-split">
    <div>
      <h3 class="bsplus-analytics-card-title">What do I need?</h3>
      <p class="bsplus-analytics-card-desc">
        The average you need on this year's remaining work to finish on your target
      </p>
    </div>
    <div class="bsplus-analytics-card-controls">
      <label class="bsplus-analytics-card-control">
        <span class="bsplus-analytics-field-label">Subject</span>
        <select
          class="bsplus-analytics-select bsplus-analytics-select-compact"
          bind:value={subject}
          onchange={savePrefs}
          aria-label="Subject"
        >
          {#each subjects as s}
            <option value={s}>{s}</option>
          {/each}
        </select>
      </label>
      <label class="bsplus-analytics-card-control">
        <span class="bsplus-analytics-field-label">Target</span>
        <span class="bsplus-target-input">
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            bind:value={target}
            onchange={savePrefs}
            aria-label="Target percentage"
          />
          <span>%</span>
        </span>
      </label>
    </div>
  </header>

  <div class="bsplus-analytics-card-body">
    {#if !result}
      <p class="bsplus-target-empty">No assessments this year yet.</p>
    {:else}
      <div class="bsplus-target-row">
        <div class="bsplus-target-big" data-verdict={result.verdict}>
          {#if result.verdict === "no-remaining"}
            <span class="bsplus-target-number">{fmt(result.current)}</span>
            <span class="bsplus-target-caption">final, everything's marked</span>
          {:else if result.verdict === "locked-in"}
            <span class="bsplus-target-number">0%</span>
            <span class="bsplus-target-caption">needed: you've already got {target}%</span>
          {:else}
            <span class="bsplus-target-number">{fmt(result.needed)}</span>
            <span class="bsplus-target-caption">
              needed across {result.remainingCount} remaining
              {result.remainingCount === 1 ? "assessment" : "assessments"}
            </span>
          {/if}
          <span class="bsplus-target-verdict">{verdictText[result.verdict]}</span>
        </div>

        <dl class="bsplus-target-stats">
          <div><dt>Current</dt><dd>{fmt(result.current)}</dd></div>
          <div>
            <dt>Marked</dt>
            <dd>{result.markedCount} · {Math.round(result.markedShare * 100)}% of weight</dd>
          </div>
          <div><dt>Best case</dt><dd>{fmt(result.bestCase)}</dd></div>
          <div><dt>Worst case</dt><dd>{fmt(result.worstCase)}</dd></div>
        </dl>
      </div>

      {#if result.estimatedWeights > 0}
        <p class="bsplus-target-note">
          {result.estimatedWeights} of {result.markedCount + result.remainingCount} weightings
          unknown, so they're estimated. Open each assessment once (or set weights on the subject's
          assessments page) for an exact answer.
        </p>
      {/if}
    {/if}
  </div>
</article>
