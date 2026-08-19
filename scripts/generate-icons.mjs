// One-off dev utility: rasterizes the brand mark into the PNG sizes the PWA
// manifest needs. Re-run with `node scripts/generate-icons.mjs` if the mark
// ever changes.
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const icon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#1d4ed8"/>
  <text x="256" y="300" font-family="Arial, Helvetica, sans-serif" font-size="220" font-weight="700" fill="#ffffff" text-anchor="middle">BS</text>
</svg>
`

// Maskable icons get cropped into a circle by some launchers, so keep the
// mark inside the safe zone (no rounded rect, smaller glyph, full bleed bg).
const maskableIcon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1d4ed8"/>
  <text x="256" y="290" font-family="Arial, Helvetica, sans-serif" font-size="180" font-weight="700" fill="#ffffff" text-anchor="middle">BS</text>
</svg>
`

mkdirSync(path.join(root, 'public/icons'), { recursive: true })

await sharp(Buffer.from(icon)).resize(192, 192).png().toFile(path.join(root, 'public/icons/icon-192.png'))
await sharp(Buffer.from(icon)).resize(512, 512).png().toFile(path.join(root, 'public/icons/icon-512.png'))
await sharp(Buffer.from(maskableIcon)).resize(512, 512).png().toFile(path.join(root, 'public/icons/icon-maskable-512.png'))

console.log('Icons written to public/icons/')
