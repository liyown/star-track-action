import { Octokit } from '@octokit/rest'
import { execFileSync } from 'node:child_process'
import { loadConfig } from '../src/config.js'
import { collectStats, githubClient } from '../src/github.js'
import { planOutput, writeOutput } from '../src/output.js'

// Local opt-in CLI: collect and write files only. Never commits or pushes.
const token =
  process.env.GITHUB_TOKEN ||
  (process.argv.includes('--gh')
    ? execFileSync('gh', ['auth', 'token'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      }).trim()
    : '')
if (!token)
  throw new Error(
    'Set GITHUB_TOKEN, or use npm run collect -- --gh to use your existing GitHub CLI login.'
  )
const configIndex = process.argv.indexOf('--config')
const config = loadConfig(
  process.cwd(),
  configIndex >= 0 ? process.argv[configIndex + 1] : 'star-track.yml',
  {},
  true
)
const snapshot = await collectStats(
  githubClient(new Octokit({ auth: token, request: { timeout: 30000 } })),
  config,
  new Date(),
  console.log
)
const files = writeOutput(planOutput(process.cwd(), snapshot, config))
console.log(
  `Generated ${files.length} changed files. ${snapshot.totals.repositories} repositories, ${snapshot.totals.stars} stars, ${snapshot.rating.grade} (${snapshot.rating.score}). Nothing committed or pushed.`
)
