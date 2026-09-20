import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { workspacePath, type Config } from './config.js'
import { renderCard } from './render/card.js'
import { escapeXml } from './render/fonts.js'
import type { Snapshot } from './types.js'

const BEGIN = '<!-- BEGIN_GITHUB_STATS -->'
const END = '<!-- END_GITHUB_STATS -->'
const historySchema = z.object({
  schemaVersion: z.literal(1),
  sourceKey: z.string(),
  entries: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        stars: z.number().int().nonnegative(),
        repositories: z.number().int().nonnegative(),
        score: z.number().int().nonnegative()
      })
    )
    .max(1000)
})
export type History = z.infer<typeof historySchema>

export function updateHistory(previous: unknown, snapshot: Snapshot): History {
  const history =
    previous === undefined ? undefined : historySchema.parse(previous)
  const today = snapshot.collectedAt.slice(0, 10)
  const cutoff = new Date(Date.parse(snapshot.collectedAt) - 365 * 86400000)
    .toISOString()
    .slice(0, 10)
  const entries =
    history?.sourceKey === snapshot.sourceKey
      ? history.entries.filter(
          (entry) => entry.date >= cutoff && entry.date < today
        )
      : []
  entries.push({
    date: today,
    stars: snapshot.totals.stars,
    repositories: snapshot.totals.repositories,
    score: snapshot.rating.score
  })
  return {
    schemaVersion: 1,
    sourceKey: snapshot.sourceKey,
    entries: [
      ...new Map(entries.map((entry) => [entry.date, entry])).values()
    ].sort((a, b) => a.date.localeCompare(b.date))
  }
}

export function replaceReadme(content: string, block: string): string {
  const starts = content.split(BEGIN).length - 1
  const ends = content.split(END).length - 1
  if (!starts && !ends)
    return `${content.trimEnd()}${content.trim() ? '\n\n' : ''}${block}\n`
  if (
    starts !== 1 ||
    ends !== 1 ||
    content.indexOf(END) < content.indexOf(BEGIN)
  )
    throw new Error(
      'README must contain exactly one ordered BEGIN_GITHUB_STATS / END_GITHUB_STATS marker pair; no files were updated'
    )
  return (
    content.slice(0, content.indexOf(BEGIN)) +
    block +
    content.slice(content.indexOf(END) + END.length)
  )
}

const markdownText = (value: string) =>
  value.replace(/[\\`*_[\]<>|]/g, '\\$&').replace(/[\r\n]/g, ' ')
const relativeUrl = (file: string, base: string) =>
  path
    .relative(path.dirname(base), file)
    .split(path.sep)
    .map((part) => encodeURIComponent(part))
    .join('/')

export function readmeBlock(snapshot: Snapshot, config: Config): string {
  const en = config.appearance.locale === 'en'
  const url = (name: string) =>
    escapeXml(
      relativeUrl(
        path.join(config.output.directory, name),
        config.output.readme
      )
    )
  const name = config.profile.name ?? snapshot.profile.name
  const alt = escapeXml(
    `${name}: ${snapshot.totals.stars} stars, ${snapshot.totals.repositories} repositories, ${snapshot.profile.contributions} contributions${config.rating.enabled ? `, ${snapshot.rating.grade} (${snapshot.rating.score})` : ''}. Updated ${snapshot.collectedAt.slice(0, 10)} UTC.`
  )
  const theme = config.appearance.theme
  const lines = [BEGIN, '', '<!-- prettier-ignore-start -->', '', '<picture>']
  if (theme === 'auto') {
    lines.push(
      `  <source media="(prefers-color-scheme: dark) and (max-width: 640px)" srcset="${url('profile-dark-compact.svg')}" />`,
      `  <source media="(max-width: 640px)" srcset="${url('profile-light-compact.svg')}" />`,
      `  <source media="(prefers-color-scheme: dark)" srcset="${url('profile-dark.svg')}" />`
    )
  } else
    lines.push(
      `  <source media="(max-width: 640px)" srcset="${url(`profile-${theme}-compact.svg`)}" />`
    )
  lines.push(
    `  <img src="${url(`profile-${theme === 'dark' ? 'dark' : 'light'}.svg`)}" alt="${alt}" width="100%" />`,
    '</picture>',
    ''
  )
  if (snapshot.featured.length)
    lines.push(
      snapshot.featured
        .map(
          (repo) =>
            `[${markdownText(repo.fullName)}](https://github.com/${repo.fullName})`
        )
        .join(' · '),
      ''
    )
  lines.push(
    `<details>`,
    `<summary>${en ? 'Statistics and scoring details' : '查看统计与评分明细'}</summary>`,
    '',
    `[${en ? 'Read the full report' : '完整统计报告'}](${relativeUrl(path.join(config.output.directory, 'summary.md'), config.output.readme)}) · [JSON](${relativeUrl(path.join(config.output.directory, 'stats.json'), config.output.readme)})`,
    '',
    '</details>',
    '',
    '<!-- prettier-ignore-end -->',
    '',
    END
  )
  return lines.join('\n')
}

export function summary(snapshot: Snapshot, config: Config): string {
  const name = markdownText(config.profile.name ?? snapshot.profile.name)
  const scope = [snapshot.scope.username, ...snapshot.scope.organizations]
    .map(markdownText)
    .join(', ')
  const s = snapshot
  return `# ${name} · Star Track\n\nUpdated: ${s.collectedAt} (UTC)\n\nPublic repository owners: ${scope}\n\nPersonal contribution window: ${s.window.from} to ${s.window.to}\n\n| Metric | Value | Scope |\n| --- | ---: | --- |\n| Stars | ${s.totals.stars} | Selected public repositories |\n| Repositories | ${s.totals.repositories} | Selected public repositories |\n| Forks received | ${s.totals.forks} | Selected public repositories |\n| Watchers | ${s.totals.watchers} | Subscribers, not stars |\n| Issues | ${s.totals.issues} | All authors in selected repositories |\n| Pull requests | ${s.totals.pullRequests} | All authors in selected repositories |\n| Issue close rate | ${s.totals.issueCloseRate.toFixed(1)}% | Selected repositories |\n| PR merge rate | ${s.totals.prMergeRate.toFixed(1)}% | Selected repositories |\n| Contributions | ${s.profile.contributions} | Personal, past 365 days |\n| Commits | ${s.profile.commits} | GitHub contribution rules, past 365 days |\n| Issues opened | ${s.profile.issues} | Personal, past 365 days |\n| PRs opened | ${s.profile.pullRequests} | Personal, past 365 days |\n| PR reviews | ${s.profile.reviews} | Personal, past 365 days |\n| Followers | ${s.profile.followers} | Personal |\n| Top language | ${markdownText(s.totals.topLanguage)} | Count of repositories by primary language |\n\n## Selected work\n\n${s.featured.map((repo) => `- [${markdownText(repo.fullName)}](https://github.com/${repo.fullName}) — ${markdownText(repo.description)} (${repo.stars} stars)`).join('\n') || 'No public repositories.'}\n\n## Open-source impact rating\n\n${s.rating.grade} · ${s.rating.score} points · formula ${s.rating.version}\n\nThis is a transparent project-impact score, not an individual skill ranking. Organization stars and forks belong to the whole organization. Contribution counts follow the API visibility of the supplied token and may include private contribution aggregates; private repository names are never requested.\n\n| Component | Points |\n| --- | ---: |\n${Object.entries(
    s.rating.breakdown
  )
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join(
      '\n'
    )}\n\nThe total is rounded once; displayed components are rounded to two decimals.\n`
}

/** Build and validate every output before touching the workspace. */
export function planOutput(
  root: string,
  snapshot: Snapshot,
  config: Config,
  demo = false
): Map<string, string> {
  const files = new Map<string, string>()
  const target = (name: string) =>
    workspacePath(root, path.join(config.output.directory, name))
  for (const theme of ['light', 'dark'] as const) {
    files.set(
      target(`profile-${theme}.svg`),
      renderCard(snapshot, config, theme, false, demo)
    )
    files.set(
      target(`profile-${theme}-compact.svg`),
      renderCard(snapshot, config, theme, true, demo)
    )
  }
  files.set(target('stats.json'), `${JSON.stringify(snapshot, null, 2)}\n`)
  files.set(target('summary.md'), summary(snapshot, config))
  const historyPath = target('history.json')
  const history: unknown = fs.existsSync(historyPath)
    ? JSON.parse(fs.readFileSync(historyPath, 'utf8'))
    : undefined
  files.set(
    historyPath,
    `${JSON.stringify(updateHistory(history, snapshot), null, 2)}\n`
  )
  const readme = workspacePath(root, config.output.readme)
  const original = fs.existsSync(readme) ? fs.readFileSync(readme, 'utf8') : ''
  files.set(readme, replaceReadme(original, readmeBlock(snapshot, config)))
  return files
}

/** Per-file atomic replacement, with rollback on ordinary write/rename errors. */
export function writeOutput(files: Map<string, string>): string[] {
  const changed = [...files].filter(
    ([file, content]) =>
      !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content
  )
  const previous = new Map(
    changed.map(([file]) => [
      file,
      fs.existsSync(file) ? fs.readFileSync(file) : null
    ])
  )
  const temporary = new Map<string, string>()
  const written: string[] = []
  try {
    for (const [file, content] of changed) {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      const temp = `${file}.${randomUUID()}.tmp`
      temporary.set(file, temp)
      fs.writeFileSync(temp, content, { flag: 'wx' })
    }
    for (const [file, temp] of temporary) {
      fs.renameSync(temp, file)
      written.push(file)
    }
  } catch (error) {
    for (const file of written.reverse()) {
      const original = previous.get(file)
      if (original) fs.writeFileSync(file, original)
      else fs.rmSync(file, { force: true })
    }
    throw error
  } finally {
    for (const temp of temporary.values()) fs.rmSync(temp, { force: true })
  }
  return changed.map(([file]) => file)
}
