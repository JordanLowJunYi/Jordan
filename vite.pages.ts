// GitHub Pages only has a real file for the home page. Every other address
// (/Tools, /Tools/2048, ...) used to be answered by 404.html: a "404 Not
// Found" page whose script bounced the browser back into the app. Visitors
// never noticed, but Google and link previews were told "page not found",
// so the arcade could never appear in search and shared links looked broken.
//
// This plugin writes a real HTML file for each page at build time (Tools.html,
// Tools/2048.html, ...; GitHub Pages serves /Tools from Tools.html), each with
// its own title, description, canonical address and link-preview text. It also
// writes sitemap.xml listing every page. Add new routes here as well as in
// src/App.tsx.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { Plugin } from 'vite'

const SITE = 'https://jordanlowjunyi.com'

interface StaticPage {
  path: string // no leading slash, as in the router
  title: string // matches what the page sets in the browser tab
  description: string
}

export const PAGES: StaticPage[] = [
  {
    path: 'Tools',
    title: "Jordan's Arcade",
    description:
      "Little browser games by Jordan Low Jun Yi: a pixel RPG of his room, 2048, a word search, a daily Wikipedia puzzle, a virtual guinea pig, a piano, a music visualiser and an indoor map maker.",
  },
  {
    path: 'Tools/Room',
    title: "Jordan's Room · Jordan's Arcade",
    description:
      "A cosy pixel RPG: wander Jordan's study and hallway, light the fire, pick lettuce for Latte, switch on the radio and find your way around his portfolio.",
  },
  {
    path: 'Tools/2048',
    title: "2048 · Jordan's Arcade",
    description: 'Play 2048 in your browser: slide and merge the tiles until you reach 2048.',
  },
  {
    path: 'Tools/WordSearch',
    title: "Word Search · Jordan's Arcade",
    description: 'A word search of biomedical, coding and liver-lab words. Drag across the letters to find them all.',
  },
  {
    path: 'Tools/Pedantle',
    title: "Pedantle · Jordan's Arcade",
    description: "Uncover today's hidden Wikipedia article one word at a time, then guess its title.",
  },
  {
    path: 'Tools/Piano',
    title: "Piano · Jordan's Arcade",
    description: 'Play the piano in your browser, train your ear, or play in the air with your hands on webcam.',
  },
  {
    path: 'Tools/Latte',
    title: "Latte · Jordan's Arcade",
    description: "Look after Latte, Jordan's guinea pig, in pixels: feed, pet, play, clean and let her nap.",
  },
  {
    path: 'Tools/Visualiser',
    title: "Visualiser · Jordan's Arcade",
    description: 'Watch music turn into pixels: bars, bursts and scopes from a demo song, your own file or your microphone.',
  },
  {
    path: 'Tools/Map',
    title: "Mapper · Jordan's Arcade",
    description: 'Draw multi-floor indoor maps by walking them, then find the shortest route between any two points.',
  },
]

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** index.html with this page's title, description, canonical URL and previews. */
function pageHtml(html: string, page: StaticPage): string {
  const url = `${SITE}/${page.path}`
  const title = escapeAttr(page.title)
  const desc = escapeAttr(page.description)
  const meta = (attr: string, key: string) => new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`)
  const swaps: [RegExp, string][] = [
    [/(<title>)[^<]*(<\/title>)/, title],
    [meta('name', 'description'), desc],
    [/(<link rel="canonical" href=")[^"]*(")/, url],
    [meta('property', 'og:title'), title],
    [meta('property', 'og:description'), desc],
    [meta('property', 'og:url'), url],
    [meta('name', 'twitter:title'), title],
    [meta('name', 'twitter:description'), desc],
  ]
  let out = html
  for (const [pattern, value] of swaps) {
    if (!pattern.test(out)) throw new Error(`[static-pages] index.html has nothing matching ${pattern}`)
    out = out.replace(pattern, (_m, before: string, after: string) => before + value + after)
  }
  return out
}

function sitemap(date: string): string {
  const urls = [`${SITE}/`, ...PAGES.map((p) => `${SITE}/${p.path}`)]
  const entries = urls.map((u) => `  <url>\n    <loc>${u}</loc>\n    <lastmod>${date}</lastmod>\n  </url>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`
}

export function staticPages(): Plugin {
  let outDir = 'dist'
  return {
    name: 'static-pages',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const html = readFileSync(join(outDir, 'index.html'), 'utf8')
      // 'wx': never overwrite. The build starts from an empty output folder.
      for (const page of PAGES) {
        const file = join(outDir, `${page.path}.html`)
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, pageHtml(html, page), { flag: 'wx' })
      }
      writeFileSync(join(outDir, 'sitemap.xml'), sitemap(new Date().toISOString().slice(0, 10)), { flag: 'wx' })
      console.log(`[static-pages] wrote ${PAGES.length} pages and sitemap.xml`)
    },
  }
}
