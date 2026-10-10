import posthog from "posthog-js";

/**
 * Client-side product analytics. This module runs once per page load before
 * hydration. Init is skipped when NEXT_PUBLIC_POSTHOG_KEY is unset (local
 * development), so analytics stays optional. Events go through
 * the /ingest reverse proxy (see next.config.mjs) to dodge ad blockers.
 */
if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2025-05-24",
    capture_pageview: "history_change",
    capture_exceptions: true,
    person_profiles: "identified_only",
    mask_all_text: true,
    mask_all_element_attributes: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
      blockSelector: "[data-auth], input[type=hidden], input[type=file]",
    },
    before_send: (event) => {
      // Auth URLs can contain one-time tokens; never send their query strings.
      if (
        event?.event === "$snapshot" &&
        /^\/(login|signup|reset-password|forgot-password|two-factor)(\/|$)/.test(
          window.location.pathname,
        )
      )
        return null;
      for (const properties of [
        event?.properties,
        event?.$set,
        event?.$set_once,
      ]) {
        if (!properties) continue;
        for (const key of [
          "$current_url",
          "$referrer",
          "$initial_current_url",
          "$initial_referrer",
        ]) {
          const value = properties[key];
          if (typeof value !== "string") continue;
          try {
            const url = new URL(value);
            url.search = "";
            url.hash = "";
            properties[key] = url.toString();
          } catch {
            /* Non-URL referrers do not contain URL tokens. */
          }
        }
      }
      return event;
    },
  });
}
