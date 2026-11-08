// The web app manifest (installability, M4a acceptance criterion 5), built from ../project.json
// by vite.config.ts. Kept in its own module so a unit test can check it without a build.
//
// Chrome's installability criteria ask for: name or short_name; icons of 192 and 512 px;
// start_url; display standalone, fullscreen, minimal-ui or window-controls-overlay. Safari on the
// iPhone reads the same manifest and the apple-touch-icon link in index.html.

export interface ProjectInfo {
  displayName: string
  tagline: string
}

export interface ManifestIcon {
  src: string
  sizes: string
  type: string
  purpose?: string
}

export interface Manifest {
  name: string
  short_name: string
  description: string
  start_url: string
  scope: string
  display: 'standalone'
  orientation: 'portrait'
  background_color: string
  theme_color: string
  icons: ManifestIcon[]
}

/** Light-mode background (--color-bg), shown on the launch screen. */
export const BACKGROUND = '#fbfaf7'
/** The icon's ink color, also used for the browser chrome where a single color is needed. */
export const THEME = '#1c1c1e'

export function buildManifest(project: ProjectInfo): Manifest {
  return {
    name: project.displayName,
    short_name: project.displayName,
    description: project.tagline,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: BACKGROUND,
    theme_color: THEME,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      // The glyph stays inside the central 80% circle (scripts/make_icons.py), so the same file
      // serves as the maskable icon.
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
