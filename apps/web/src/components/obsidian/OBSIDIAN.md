# ObsidianUI components (vendored)

Copied from the ObsidianUI registry (`https://www.obsidianui.dev/r/{name}.json`) on 2026-10-07 and edited in place:
`dashboard-shell`, `active-sessions`, `status-bars`, `discover-button`, `flip-text` (hover version from the docs; the registry JSON needs an unshipped stylesheet).

- `obsidian-theme.css` maps the library's palette variables onto our tokens in `app/globals.css`.
- `flip-text` is the docs' hover version, with aria-label and reduced-motion handling.
- `discover-button` has a local `size="sm"` and uses Next `Link` for internal hrefs.
- Not installed: split-showcase, art-gallery (three.js), hover-img, draggable-marquee, text-stream (gsap): landing-page effects.
- Confirm the library's licence terms before shipping.
