import fs from 'node:fs'
import path from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import { demoConfig, demoSnapshot } from './fixture.js'
import { renderCard } from '../src/render/card.js'
import { loadConfig } from '../src/config.js'
import type { Snapshot } from '../src/types.js'

const live = process.argv.includes('--live')
const config = live ? loadConfig(process.cwd()) : demoConfig
const snapshot: Snapshot = live
  ? JSON.parse(
      fs.readFileSync(path.join(config.output.directory, 'stats.json'), 'utf8')
    )
  : demoSnapshot
const folder = path.resolve('preview')
fs.mkdirSync(folder, { recursive: true })
// Keep the comparison on the reference's example data even when previewing live data.
fs.writeFileSync(
  path.join(folder, 'comparison.svg'),
  renderCard(demoSnapshot, demoConfig, 'light', false, true)
)
for (const theme of ['light', 'dark'] as const) {
  for (const compact of [false, true]) {
    const name = `${theme}${compact ? '-compact' : ''}`
    const svg = renderCard(snapshot, config, theme, compact, !live)
    fs.writeFileSync(path.join(folder, `${name}.svg`), svg)
    fs.writeFileSync(
      path.join(folder, `${name}.png`),
      new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng()
    )
  }
}
fs.writeFileSync(
  path.join(folder, 'index.html'),
  `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Star Track · Preview</title><style>*{box-sizing:border-box}body{margin:0;background:#e8ebe6;color:#18241c;font:14px system-ui}header{padding:18px 24px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}header strong{margin-right:auto}button{color:inherit;font:inherit;padding:8px 16px;border:1px solid #a8b4aa;background:transparent;border-radius:6px;cursor:pointer}button[aria-pressed=true]{background:#285f46;color:white;border-color:#285f46}main{max-width:1440px;margin:0 auto 40px}img{width:100%;display:block}main.compact{max-width:400px}body.dark{background:#09110c;color:#eee}a{color:inherit}small{opacity:.65}</style><header><strong>STAR TRACK <small>${live ? '实时采集预览' : '示例数据预览'}</small></strong><button id="light" aria-pressed="true">浅色</button><button id="dark" aria-pressed="false">深色</button><button id="compact" aria-pressed="false">手机布局</button><a href="light.svg" download>下载 SVG</a></header><main><img src="light.svg" alt="Star Track profile card"></main><script>let theme='light',compact=false;function render(){document.querySelector('img').src=theme+(compact?'-compact':'')+'.svg';document.querySelector('main').classList.toggle('compact',compact);document.body.classList.toggle('dark',theme==='dark');document.querySelector('a').href=document.querySelector('img').src;for(const id of ['light','dark','compact'])document.getElementById(id).setAttribute('aria-pressed',String(id==='compact'?compact:id===theme))}for(const id of ['light','dark'])document.getElementById(id).onclick=()=>{theme=id;render()};document.getElementById('compact').onclick=()=>{compact=!compact;render()};</script></html>`
)
console.log(
  `Generated ${live ? 'live' : 'deterministic demo'} SVG and PNG previews in ${folder}`
)
