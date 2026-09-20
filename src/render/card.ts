import type { Config } from '../config.js'
import type { Snapshot } from '../types.js'
import { Typography, escapeXml, round } from './fonts.js'
import { starPaths } from './icons.js'

export type Theme = 'light' | 'dark'
const palettes = {
  light: {
    bg: '#faf9f6',
    ink: '#19241e',
    muted: '#666c72',
    accent: '#285f46',
    line: '#a5aca5',
    faint: '#e6ebe2',
    bar: '#8aaf91'
  },
  dark: {
    bg: '#121b17',
    ink: '#f3f0e7',
    muted: '#adb9b0',
    accent: '#a1d2af',
    line: '#344b3d',
    faint: '#26382d',
    bar: '#659e76'
  }
}
const number = (value: number) => new Intl.NumberFormat('en-US').format(value)

export function activityDays(
  snapshot: Snapshot
): { date: string; count: number }[] {
  const counts = new Map(
    snapshot.profile.calendar.map((day) => [day.date, day.count])
  )
  const end = Date.parse(`${snapshot.collectedAt.slice(0, 10)}T00:00:00Z`)
  return Array.from({ length: 84 }, (_, index) => {
    const date = new Date(end - (83 - index) * 86400000)
      .toISOString()
      .slice(0, 10)
    return { date, count: counts.get(date) ?? 0 }
  })
}

export function renderCard(
  snapshot: Snapshot,
  config: Config,
  theme: Theme,
  compact = false,
  demo = false
): string {
  const p = palettes[theme]
  const type = new Typography()
  const en = config.appearance.locale === 'en'
  const label = (zh: string, english: string) => (en ? english : zh)
  const name = config.profile.name ?? snapshot.profile.name
  const initials =
    config.profile.initials ??
    [...snapshot.profile.login.slice(0, 2)].join('').toUpperCase()
  const date = snapshot.collectedAt.slice(0, 10).replaceAll('-', '.')
  const scope = snapshot.scope.organizations.length
    ? label('个人 + ', 'Personal + ') + snapshot.scope.organizations.join(' / ')
    : label('个人开源项目', 'Personal open source')
  const totalScope = snapshot.scope.organizations.length
    ? label('个人与组织项目总计', 'Personal + organization projects')
    : label('个人项目总计', 'Personal projects')
  const days = activityDays(snapshot)
  const activityTotal = days.reduce((sum, day) => sum + day.count, 0)
  const width = compact ? 640 : 1440
  const rows = Math.max(1, snapshot.featured.length)
  const height = compact ? 838 + rows * 130 : 830 + rows * 66
  const out: string[] = []
  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    color = p.ink,
    options: Parameters<Typography['text']>[5] = {}
  ) => out.push(type.text(value, x, y, size, color, options))
  const line = (x: number, y: number, x2: number, y2 = y, color = p.line) =>
    out.push(
      `<path d="M${x} ${y}H${x2}" stroke="${color}" stroke-width="1"/>`.replace(
        `H${x2}`,
        y2 === y ? `H${x2}` : `L${x2} ${y2}`
      )
    )
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    radius = 0
  ) =>
    out.push(
      `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="${radius}" fill="${fill}"/>`
    )

  function grade(x: number, y: number, w: number): void {
    if (!config.rating.enabled) {
      text('BUILD IDEAS', x, y + 26, 20, p.muted)
      text('IN PUBLIC.', x, y + 56, 20, p.muted)
      return
    }
    text('Open-source impact', x, y, compact ? 18 : 21, p.muted, {
      italic: true,
      maxWidth: w
    })
    text(snapshot.rating.grade, x, y + 92, 92, p.accent, {
      display: true,
      maxWidth: w,
      shrink: true
    })
    text(
      `${number(snapshot.rating.score)} ${label('分', 'POINTS')}`,
      x,
      y + 128,
      21,
      p.ink
    )
    rect(x, y + 148, w, 4, p.faint, 2)
    rect(x, y + 148, w * snapshot.rating.progress, 4, p.accent, 2)
    text(
      snapshot.rating.nextGrade
        ? label(
            `距 ${snapshot.rating.nextGrade} 还差 ${number(snapshot.rating.nextScore! - snapshot.rating.score)} 分`,
            `${number(snapshot.rating.nextScore! - snapshot.rating.score)} TO ${snapshot.rating.nextGrade}`
          )
        : label('已达到最高等级', 'HIGHEST GRADE'),
      x,
      y + 180,
      15,
      p.muted,
      { maxWidth: w }
    )
    text('RATING v2', x, y + 212, 12, p.muted)
  }

  function chart(x: number, y: number, w: number, h: number): void {
    // 42 two-day bins, anchored to the collection date. Zero is a baseline, never invented activity.
    const bins = Array.from(
      { length: 42 },
      (_, i) => days[i * 2].count + days[i * 2 + 1].count
    )
    const maximum = Math.max(1, ...bins)
    const step = w / bins.length
    bins.forEach((count, i) => {
      const barHeight = count ? Math.max(3, (count / maximum) * h) : 2
      rect(
        x + i * step,
        y + h - barHeight,
        step - 5,
        barHeight,
        count ? (i >= 35 ? p.accent : p.bar) : p.faint,
        3
      )
    })
  }

  if (!compact) {
    text(`STAR TRACK / ${config.appearance.title}`, 64, 52, 17, p.muted, {
      maxWidth: 900
    })
    text(
      `${demo ? label('示例数据 · ', 'DEMO · ') : ''}${date}`,
      1376,
      52,
      17,
      p.muted,
      { align: 'right' }
    )
    line(64, 76, 1376, 76, p.accent)
    if (/^[A-Za-z]{2}$/.test(initials)) {
      text(initials[0], 80, 184, 72, p.accent, { display: true })
      text(initials[1], 105, 205, 72, p.accent, { display: true })
      line(106, 239, 171, 174, p.accent)
    } else {
      text(initials, 80, 185, 72, p.accent, {
        display: true,
        maxWidth: 145,
        shrink: true
      })
    }
    text('BUILD', 70, 296, 16, p.muted)
    text('IDEAS', 70, 320, 16, p.muted)
    text('IN PUBLIC.', 70, 344, 16, p.muted)
    line(70, 371, 98, 371, p.accent)
    text(name, 278, 240, 166, p.ink, {
      display: true,
      maxWidth: 794,
      shrink: true
    })
    text(`@${snapshot.profile.login}`, 282, 278, 26, p.muted)
    text(config.profile.headline, 282, 351, 44, p.ink, {
      display: true,
      maxWidth: 790,
      shrink: true
    })
    text(scope, 282, 394, 24, p.muted, { maxWidth: 790 })
    line(1104, 124, 1104, 382)
    grade(1150, 139, 224)
    line(64, 425, 1376, 425, p.accent)
    const metrics = [
      [snapshot.totals.stars, 'Stars', totalScope, 64, 274, 190],
      [snapshot.totals.repositories, 'Repositories', totalScope, 548, 655, 91],
      [
        snapshot.profile.contributions,
        'Contributions',
        label('个人近一年贡献', 'Personal · past 365 days'),
        953,
        1180,
        207
      ]
    ] as const
    metrics.forEach(([value, title, subtitle, x, titleX, maxWidth]) => {
      text(number(value), x, 509, 82, p.accent, {
        display: true,
        maxWidth,
        shrink: true
      })
      text(title, titleX, 478, 29, p.muted, { italic: true, maxWidth: 202 })
      text(subtitle, titleX, 507, 17, p.muted, { maxWidth: 202 })
    })
    line(495, 455, 495, 515)
    line(928, 455, 928, 515)
    line(64, 550, 1376, 550, p.accent)
    text(label('精选作品', 'Selected work'), 64, 607, 36, p.ink, {
      display: true
    })
    text(
      en ? '/ Built in the open' : '/ Selected work',
      en ? 310 : 232,
      607,
      28,
      p.muted,
      { italic: true }
    )
    text('GOOD SOFTWARE FOR A BRIGHTER TOMORROW', 1310, 602, 13, p.muted, {
      align: 'right'
    })
    line(1334, 597, 1376, 597, p.accent)
    line(64, 634, 1376, 634, p.accent)
    snapshot.featured.forEach((repo, index) => {
      const y = 675 + index * 66
      text(String(index + 1).padStart(2, '0'), 64, y, 23, p.muted)
      const owner = type.fit(`${repo.owner} /`, 22, 180)
      const ownerWidth = type.width(owner, 22)
      text(owner, 144, y, 22, p.muted)
      text(repo.name, 156 + ownerWidth, y, 26, p.accent, {
        bold: true,
        italic: true,
        maxWidth: 366 - ownerWidth
      })
      line(536, y - 21, 536, y + 6, p.accent)
      text(
        repo.description || label('一个开源项目', 'An open-source project'),
        566,
        y,
        21,
        p.muted,
        { maxWidth: 452 }
      )
      rect(1058, y - 13, 12, 12, p.accent, 6)
      text(repo.language, 1086, y, 21, p.muted, { italic: true, maxWidth: 135 })
      out.push(
        `<g transform="translate(1254 ${y - 22})" fill="${p.accent}">${starPaths.map((d) => `<path d="${d}"/>`).join('')}</g>`
      )
      text(number(repo.stars), 1376, y, 24, p.muted, {
        align: 'right',
        maxWidth: 88,
        shrink: true
      })
      line(
        64,
        y + 27,
        1376,
        y + 27,
        index === snapshot.featured.length - 1 ? p.accent : p.line
      )
    })
    if (!snapshot.featured.length)
      text(
        label('还没有可展示的公开项目', 'No public repositories to show yet'),
        144,
        675,
        23,
        p.muted
      )
    const y = 663 + rows * 66
    text(label('持续构建', 'In the making'), 64, y + 40, 28, p.ink, {
      display: true
    })
    line(64, y + 62, 93, y + 62, p.accent)
    text(
      label(
        `过去12周 · ${number(activityTotal)} 次贡献`,
        `12 weeks · ${number(activityTotal)} contributions`
      ),
      104,
      y + 68,
      17,
      p.muted,
      { maxWidth: 265 }
    )
    chart(390, y + 2, 730, 66)
    text(
      label('每天前进一步', 'ONE DAY AT A TIME.'),
      1376,
      y + 33,
      18,
      p.muted,
      { align: 'right' }
    )
    text(label('让好的想法生长', 'KEEP BUILDING.'), 1376, y + 59, 18, p.muted, {
      align: 'right'
    })
    line(1349, y + 76, 1376, y + 76, p.accent)
    text(
      `Updated ${date} UTC · Powered by Star Track`,
      64,
      height - 36,
      14,
      p.muted
    )
    text(
      'OPEN SOURCE MAKES A BRIGHTER TOMORROW',
      1327,
      height - 36,
      12,
      p.muted,
      { align: 'right' }
    )
    line(1350, height - 40, 1376, height - 40, p.accent)
  } else {
    text('STAR TRACK / OPEN SOURCE PROFILE', 32, 38, 13, p.muted)
    line(32, 58, 608, 58, p.accent)
    text(initials, 32, 126, 44, p.accent, { display: true, maxWidth: 120 })
    text(demo ? label('示例数据', 'DEMO DATA') : date, 608, 112, 14, p.muted, {
      align: 'right'
    })
    text(name, 32, 213, 80, p.ink, {
      display: true,
      maxWidth: 576,
      shrink: true
    })
    text(`@${snapshot.profile.login}`, 32, 250, 23, p.muted)
    text(config.profile.headline, 32, 300, 26, p.ink, {
      maxWidth: 576,
      shrink: true
    })
    text(scope, 32, 335, 18, p.muted, { maxWidth: 576 })
    line(32, 363, 608, 363, p.accent)
    grade(414, 395, 192)
    const items = [
      [snapshot.totals.stars, 'Stars'],
      [snapshot.totals.repositories, 'Repositories'],
      [snapshot.profile.contributions, 'Contributions / 365d']
    ] as const
    items.forEach(([value, title], i) => {
      text(number(value), 32, 422 + i * 70, 47, p.accent, {
        display: true,
        maxWidth: 177,
        shrink: true
      })
      text(title, 224, 413 + i * 70, 20, p.muted, {
        italic: true,
        maxWidth: 170
      })
    })
    text(totalScope, 32, 602, 15, p.muted, { maxWidth: 330 })
    line(32, 630, 608, 630, p.accent)
    text(label('精选作品', 'Selected work'), 32, 675, 27, p.ink)
    snapshot.featured.forEach((repo, i) => {
      const y = 714 + i * 130
      text(
        `${String(i + 1).padStart(2, '0')}  ${repo.owner} /`,
        32,
        y,
        15,
        p.muted,
        { maxWidth: 390 }
      )
      text(repo.name, 32, y + 34, 29, p.accent, {
        italic: true,
        bold: true,
        maxWidth: 390
      })
      text(`${number(repo.stars)} stars`, 608, y + 32, 18, p.ink, {
        align: 'right',
        maxWidth: 158
      })
      text(
        repo.description || label('一个开源项目', 'An open-source project'),
        32,
        y + 70,
        19,
        p.muted,
        { maxWidth: 576 }
      )
      text(repo.language, 32, y + 96, 14, p.muted)
      line(32, y + 111, 608)
    })
    if (!snapshot.featured.length)
      text(
        label('还没有公开项目', 'No public repositories yet'),
        32,
        744,
        23,
        p.muted
      )
    const y = 703 + rows * 130
    text(label('持续构建', 'In the making'), 32, y + 31, 20, p.ink)
    chart(225, y, 383, 43)
    text(
      `12 weeks · ${number(activityTotal)} contributions`,
      32,
      y + 66,
      12,
      p.muted
    )
    text(`${date} UTC · Star Track`, 608, height - 17, 12, p.muted, {
      align: 'right'
    })
  }
  const paper =
    theme === 'light'
      ? ['#fffdf6', '#f7f3e9', '#eae5d8']
      : ['#243c30', '#182a21', '#101c17']
  const backgroundDefs = `<radialGradient id="paper-light" cx="24%" cy="12%" r="110%"><stop offset="0" stop-color="${paper[0]}"/><stop offset=".55" stop-color="${paper[1]}"/><stop offset="1" stop-color="${paper[2]}"/></radialGradient><filter id="paper-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="3" stitchTiles="stitch" seed="17"/><feColorMatrix type="saturate" values="0"/></filter>`
  const background = `<rect width="${width}" height="${height}" fill="url(#paper-light)"/><rect width="${width}" height="${height}" filter="url(#paper-grain)" opacity="${theme === 'light' ? '.065' : '.045'}"/>`
  const description = `${name}. ${snapshot.rating.grade}, ${snapshot.rating.score} points. ${snapshot.totals.stars} stars across ${snapshot.totals.repositories} public repositories. ${snapshot.profile.contributions} personal contributions in the past 365 days. ${snapshot.featured.map((repo) => `${repo.fullName}: ${repo.description}`).join('; ')}`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description"><title id="title">${escapeXml(`${name} · Star Track${demo ? ' · Demo data' : ''}`)}</title><desc id="description">${escapeXml(description)}</desc><defs>${backgroundDefs}${type.defs()}</defs><rect width="${width}" height="${height}" fill="${p.bg}"/>${background}${out.join('')}</svg>\n`
}
