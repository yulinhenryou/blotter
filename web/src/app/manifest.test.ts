// The manifest meets Chrome's installability criteria (M4a acceptance criterion 5, the part
// that can be checked without a browser; the end-to-end test checks the built app).

import { describe, expect, it } from 'vitest'

import { buildManifest } from '../../manifest.ts'

const manifest = buildManifest({ displayName: 'Example', tagline: 'An example.' })
// Files in web/public, which Vite copies to the root of the build.
const publicFiles = Object.keys(import.meta.glob('../../public/*')).map((p) =>
  p.replace('../../public', ''),
)

describe('web app manifest', () => {
  it('names the app from the project definition', () => {
    expect(manifest.name).toBe('Example')
    expect(manifest.short_name).toBe('Example')
    expect(manifest.description).toBe('An example.')
  })

  it('opens standalone at the root', () => {
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
  })

  it('has 192 and 512 px PNG icons and a maskable one, all present in public/', () => {
    const png = manifest.icons.filter((i) => i.type === 'image/png')
    expect(png.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true)
    for (const icon of manifest.icons) expect(publicFiles).toContain(icon.src)
    expect(publicFiles).toContain('/apple-touch-icon.png')
  })
})
