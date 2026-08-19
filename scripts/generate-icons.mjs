// One-off dev utility: rasterizes the brand mark into the PNG sizes the PWA
// manifest needs. Re-run with `node scripts/generate-icons.mjs` if the mark
// ever changes.
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

// Cyrix, not "Blue Star", is the parent brand (Cyrix acquired Blue Star).
// "CX" monogram: white C, red X — the X stays red as it is in the CYRIX
// wordmark itself, but paired with the C it reads as a mark, not a bare
// symbol (a lone red X on black read as unrelated-site branding).
const icon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#000000"/>
  <text x="256" y="300" font-family="Arial, Helvetica, sans-serif" font-size="220" font-weight="700" text-anchor="middle">
    <tspan fill="#ffffff">C</tspan><tspan fill="#e30613">X</tspan>
  </text>
</svg>
`

// Maskable icons get cropped into a circle by some launchers, so keep the
// mark inside the safe zone (no rounded rect, smaller glyph, full bleed bg).
const maskableIcon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#000000"/>
  <text x="256" y="290" font-family="Arial, Helvetica, sans-serif" font-size="180" font-weight="700" text-anchor="middle">
    <tspan fill="#ffffff">C</tspan><tspan fill="#e30613">X</tspan>
  </text>
</svg>
`

mkdirSync(path.join(root, 'public/icons'), { recursive: true })

await sharp(Buffer.from(icon)).resize(192, 192).png().toFile(path.join(root, 'public/icons/icon-192.png'))
await sharp(Buffer.from(icon)).resize(512, 512).png().toFile(path.join(root, 'public/icons/icon-512.png'))
await sharp(Buffer.from(maskableIcon)).resize(512, 512).png().toFile(path.join(root, 'public/icons/icon-maskable-512.png'))

console.log('Icons written to public/icons/')
