"use client";

// "Use this week": a journal of your own with this week as its weekly
// spread, opened in the editor (app/from/[key]/route.ts - a guest is made on
// the way for someone with no account). A plain form POST, so it works
// before the page's script has loaded; the browser's time zone goes with it
// when the script has, so the new book's dates are the person's own.

import site from "./site.module.css";

export function UseThisWeek({ spreadKey, label = "Use this week", quiet = false }: { spreadKey: string; label?: string; quiet?: boolean }) {
  return (
    <form
      method="post"
      action={`/app/from/${encodeURIComponent(spreadKey)}`}
      onSubmit={(event) => {
        const zone = event.currentTarget.elements.namedItem("tz");
        if (zone instanceof HTMLInputElement) zone.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
      }}
    >
      <input type="hidden" name="tz" defaultValue="" />
      <button type="submit" className={quiet ? site.buttonQuiet : site.button}>
        {label}
      </button>
    </form>
  );
}
