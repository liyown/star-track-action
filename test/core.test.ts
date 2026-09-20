import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  configSchema,
  loadConfig,
  sourceKey,
  workspacePath
} from '../src/config.js'
import {
  buildSnapshot,
  collectStats,
  fetchRepositories,
  withRetry,
  type GitHubClient
} from '../src/github.js'
import { GRADES, calculateRating } from '../src/rating.js'
import {
  readmeBlock,
  replaceReadme,
  planOutput,
  updateHistory,
  writeOutput
} from '../src/output.js'
import { activityDays, renderCard } from '../src/render/card.js'
import {
  demoConfig,
  demoSnapshot,
  demoProfile,
  repository
} from '../script/fixture.js'
import { Resvg } from '@resvg/resvg-js'
import { execFileSync } from 'node:child_process'
import { commitAndPush } from '../src/git.js'

function temp(t: { after: (fn: () => void) => void }): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'star-track-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}
const wrap = (result: unknown): GitHubClient => ({
  graphql: async <T>() => result as T,
  organizations: async () => []
})
const page = (cursor: string | null, next: boolean) => ({
  repositoryOwner: {
    repositories: {
      nodes: [],
      pageInfo: { hasNextPage: next, endCursor: cursor }
    }
  }
})

test('config: strict keys, featured uniqueness and organization scope', () => {
  assert.throws(() => configSchema.parse({ username: 'liyown', profille: {} }))
  assert.throws(() =>
    configSchema.parse({ username: 'liyown', organizations: ['org'] })
  )
  assert.throws(() =>
    configSchema.parse({ username: 'liyown', featured: ['me/repo', 'ME/Repo'] })
  )
  assert.throws(() =>
    configSchema.parse({
      username: 'liyown',
      featured: ['https://github.com/me/repo']
    })
  )
  assert.equal(configSchema.parse({ username: 'liyown' }).rating.enabled, true)
})

test('YAML rejects duplicate keys, applies legacy overrides and contains all output paths', (t) => {
  const root = temp(t)
  fs.writeFileSync(
    path.join(root, 'star-track.yml'),
    'username: liyown\nscope: all\nprofile:\n  name: Test\n'
  )
  const config = loadConfig(root, 'star-track.yml', {
    username: 'octocat',
    readme: 'docs/Profile.md',
    title: 'My projects'
  })
  assert.equal(config.username, 'octocat')
  assert.equal(config.profile.name, 'Test')
  assert.equal(config.appearance.title, 'My projects')
  assert.equal(config.output.readme, 'docs/Profile.md')
  assert.throws(() => loadConfig(root, 'missing.yml', {}, true))
  fs.writeFileSync(
    path.join(root, 'star-track.yml'),
    'username: liyown\nusername: octocat\n'
  )
  assert.throws(() => loadConfig(root), /YAML/)
  assert.throws(() => workspacePath(root, '../outside'), /escapes/)
  assert.throws(() => workspacePath(root, '.git/config'), /\.git/)
  fs.symlinkSync(os.tmpdir(), path.join(root, 'linked'))
  assert.throws(() => workspacePath(root, 'linked/profile.svg'), /Symlink/)
})

test('collection fingerprint ignores presentation, changes with data scope', () => {
  assert.equal(
    sourceKey(demoConfig),
    sourceKey({
      ...demoConfig,
      profile: { ...demoConfig.profile, name: 'Another name' }
    })
  )
  assert.notEqual(
    sourceKey(demoConfig),
    sourceKey({ ...demoConfig, scope: 'personal' })
  )
})

test('repository aggregation deduplicates, filters forks and archived repos, uses actual watchers', () => {
  const config = configSchema.parse({
    username: 'liyown',
    repositories: { include_archived: false }
  })
  const snapshot = buildSnapshot(
    config,
    demoProfile,
    [
      repository(),
      repository(),
      repository({ fullName: 'liyown/fork', isFork: true }),
      repository({ fullName: 'liyown/old', isArchived: true })
    ],
    [],
    demoSnapshot.collectedAt,
    demoSnapshot.window.from
  )
  assert.equal(snapshot.totals.repositories, 1)
  assert.equal(snapshot.totals.stars, 2160)
  assert.equal(snapshot.totals.watchers, 28)
  assert.equal(snapshot.totals.issueCloseRate, (38 / 42) * 100)
  assert.equal(snapshot.profile.commits, 1016)
})

test('featured order and custom copy preserved, missing/excluded project fails', () => {
  const config = configSchema.parse({
    username: 'liyown',
    featured: [{ repo: 'liyown/project-alpha', description: '<custom & copy>' }]
  })
  const result = buildSnapshot(
    config,
    demoProfile,
    [repository()],
    [],
    demoSnapshot.collectedAt,
    demoSnapshot.window.from
  )
  assert.equal(result.featured[0].description, '<custom & copy>')
  assert.throws(
    () =>
      buildSnapshot(
        config,
        demoProfile,
        [],
        [],
        demoSnapshot.collectedAt,
        demoSnapshot.window.from
      ),
    /Featured repository/
  )
})

test('empty accounts yield finite totals and a valid grade', () => {
  const snapshot = buildSnapshot(
    configSchema.parse({ username: 'liyown' }),
    {
      ...demoProfile,
      followers: 0,
      contributedTo: 0,
      commits: 0,
      issues: 0,
      pullRequests: 0
    },
    [],
    [],
    demoSnapshot.collectedAt,
    demoSnapshot.window.from
  )
  assert.equal(snapshot.totals.issueCloseRate, 0)
  assert.equal(snapshot.totals.prMergeRate, 0)
  assert.ok(Number.isFinite(snapshot.rating.score))
  assert.equal(snapshot.featured.length, 0)
})

test('all rating boundaries and maximum grade remain well defined', () => {
  for (const [grade, threshold] of GRADES) {
    const profile = {
      ...demoProfile,
      followers: 0,
      contributedTo: 0,
      commits: 0,
      issues: 0,
      pullRequests: 0,
      createdAt: demoSnapshot.collectedAt
    }
    // Each empty repository is exactly one point. No stars, forks or longevity bonuses.
    const repos = Array.from({ length: threshold }, () =>
      repository({ stars: 0, forks: 0 })
    )
    const rating = calculateRating(profile, repos, demoSnapshot.collectedAt)
    assert.equal(rating.grade, grade)
    assert.equal(rating.score, threshold)
    assert.equal(rating.progress, grade === 'SSS' ? 1 : 0)
  }
})

test('failed second page never returns first-page data', async () => {
  let calls = 0
  const client: GitHubClient = {
    ...wrap(null),
    graphql: async <T>() => {
      if (calls++ === 0) return page('next', true) as T
      throw new Error('rate limit')
    }
  }
  await assert.rejects(fetchRepositories(client, 'liyown'), /rate limit/)
  assert.equal(calls, 2)
})

test('null owner and repeated pagination cursor fail explicitly', async () => {
  await assert.rejects(
    fetchRepositories(wrap({ repositoryOwner: null }), 'unknown'),
    /not found/
  )
  await assert.rejects(
    fetchRepositories(wrap(page('same', true)), 'liyown'),
    /cursor/
  )
})

test('transient retries are bounded and permission failures are not retried', async () => {
  let calls = 0
  const delays: number[] = []
  assert.equal(
    await withRetry(
      async () => {
        if (++calls < 3) throw { status: 502 }
        return 42
      },
      async (ms) => {
        delays.push(ms)
      }
    ),
    42
  )
  assert.deepEqual(delays, [1000, 2000])
  calls = 0
  await assert.rejects(
    withRetry(
      async () => {
        calls++
        throw Object.assign(new Error('forbidden'), { status: 403 })
      },
      async () => {}
    )
  )
  assert.equal(calls, 1)
})

test('GraphQL contribution window is never longer than 365 days, including leap years', async () => {
  let variables: Record<string, unknown> = {}
  const client: GitHubClient = {
    ...wrap(null),
    graphql: async <T>(_query: string, vars: Record<string, unknown>) => {
      variables = vars
      return { user: null } as T
    }
  }
  await assert.rejects(
    collectStats(
      client,
      configSchema.parse({ username: 'liyown' }),
      new Date('2024-02-29T12:00:00Z')
    ),
    /not found/
  )
  assert.equal(
    Date.parse(String(variables.to)) - Date.parse(String(variables.from)),
    365 * 86400000
  )
})

test('README replacement preserves surrounding content and literal dollar expressions', () => {
  const original =
    '# Before\n<!-- BEGIN_GITHUB_STATS -->old<!-- END_GITHUB_STATS -->\nAfter'
  const block = "<!-- BEGIN_GITHUB_STATS -->$& $` $'<!-- END_GITHUB_STATS -->"
  const result = replaceReadme(original, block)
  assert.equal(result, `# Before\n${block}\nAfter`)
  assert.equal(replaceReadme(result, block), result)
  assert.throws(
    () => replaceReadme('<!-- BEGIN_GITHUB_STATS -->', block),
    /exactly one/
  )
  assert.throws(() => replaceReadme(original + original, block), /exactly one/)
  assert.match(replaceReadme('# Empty', block), /^# Empty\n\n/)
})

test('README picture sources use correct paths for nested README and media ordering', () => {
  const config = configSchema.parse({
    username: 'liyown',
    output: { readme: 'docs/README.md', directory: 'assets/my cards' }
  })
  const block = readmeBlock(demoSnapshot, config)
  assert.match(block, /\.\.\/assets\/my%20cards\/profile-light.svg/)
  assert.ok(
    block.indexOf('dark) and (max-width') < block.indexOf('media="(max-width')
  )
  assert.match(block, /https:\/\/github.com\/liyown\/project-alpha/)
})

test('history replaces same-day records and resets incompatible scopes', () => {
  const first = updateHistory(undefined, demoSnapshot)
  const next = updateHistory(first, {
    ...demoSnapshot,
    totals: { ...demoSnapshot.totals, stars: 999 }
  })
  assert.equal(next.entries.length, 1)
  assert.equal(next.entries[0].stars, 999)
  const reset = updateHistory(first, {
    ...demoSnapshot,
    sourceKey: 'changed',
    collectedAt: '2026-09-21T00:00:00Z'
  })
  assert.equal(reset.entries.length, 1)
  assert.equal(reset.entries[0].date, '2026-09-21')
  assert.throws(() => updateHistory({ entries: [] }, demoSnapshot))
})

test('output validation fails before writing, while repeat writes are a no-op', (t) => {
  const root = temp(t)
  fs.writeFileSync(
    path.join(root, 'README.md'),
    '<!-- BEGIN_GITHUB_STATS -->broken'
  )
  assert.throws(() => planOutput(root, demoSnapshot, demoConfig), /exactly one/)
  assert.equal(fs.existsSync(path.join(root, 'assets')), false)
  fs.writeFileSync(path.join(root, 'README.md'), '# Test\n')
  const files = planOutput(root, demoSnapshot, demoConfig)
  assert.equal(writeOutput(files).length, 8)
  assert.equal(
    writeOutput(planOutput(root, demoSnapshot, demoConfig)).length,
    0
  )
})

test('activity chart is anchored to snapshot date and fills missing days with zero', () => {
  const days = activityDays({
    ...demoSnapshot,
    profile: { ...demoProfile, calendar: [{ date: '2026-09-20', count: 12 }] }
  })
  assert.equal(days.length, 84)
  assert.equal(days.at(-1)?.date, '2026-09-20')
  assert.equal(
    days.reduce((sum, day) => sum + day.count, 0),
    12
  )
})

test('SVG is deterministic, self-contained, escaped and renders without system fonts', () => {
  const config = configSchema.parse({
    ...demoConfig,
    profile: {
      ...demoConfig.profile,
      name: 'Long <Name> & 中文',
      headline: 'A long title '.repeat(7)
    }
  })
  for (const theme of ['light', 'dark'] as const) {
    for (const compact of [false, true]) {
      const svg = renderCard(demoSnapshot, config, theme, compact)
      assert.equal(svg, renderCard(demoSnapshot, config, theme, compact))
      assert.ok(!/<text\b|<script\b|<foreignObject\b|<image\b/.test(svg))
      assert.ok(!/href="https?:/.test(svg))
      assert.match(svg, /Long &lt;Name&gt; &amp; 中文/)
      const result = new Resvg(svg, {
        font: { loadSystemFonts: false }
      }).render()
      assert.equal(result.width, compact ? 640 : 1440)
      assert.ok(result.asPng().length > 10000)
    }
  }
})

test('git preserves staged changes and surfaces push failure', async (t) => {
  const root = temp(t)
  const git = (args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
  git(['init', '-b', 'main'])
  git(['config', 'user.name', 'Test'])
  git(['config', 'user.email', 'test@example.com'])
  fs.writeFileSync(path.join(root, 'existing'), 'test')
  git(['add', 'existing'])
  git(['commit', '-m', 'initial'])
  const generated = path.join(root, 'card with spaces; literal.svg')
  fs.writeFileSync(generated, '<svg/>')
  fs.writeFileSync(path.join(root, 'existing'), 'user change')
  git(['add', 'existing'])
  await assert.rejects(
    commitAndPush(root, [generated], 'update'),
    /existing staged change/
  )
  assert.equal(git(['diff', '--cached', '--name-only']).trim(), 'existing')
  git(['reset', 'HEAD', '--', 'existing'])
  await assert.rejects(commitAndPush(root, [generated], 'update'), /git push/)
  assert.equal(git(['log', '-1', '--format=%s']).trim(), 'update')
  assert.equal(git(['show', 'HEAD:existing']).trim(), 'test')
  assert.equal(git(['config', 'user.name']).trim(), 'Test')
})
