import * as core from '@actions/core'
import { Octokit } from '@octokit/rest'
import path from 'node:path'
import { loadConfig } from './config.js'
import { collectStats, githubClient } from './github.js'
import { planOutput, summary, writeOutput } from './output.js'
import { commitAndPush } from './git.js'

export async function run(): Promise<void> {
  const start = Date.now()
  try {
    const root = path.resolve(process.env.GITHUB_WORKSPACE || process.cwd())
    const configFile = core.getInput('config_path')
    const config = loadConfig(
      root,
      configFile || 'star-track.yml',
      {
        username: core.getInput('username'),
        scope: core.getInput('scope'),
        readme: core.getInput('readme_path'),
        title: core.getInput('card_title')
      },
      Boolean(configFile)
    )
    const token = core.getInput('github_token', { required: true })
    const commit = core.getInput('auto_commit')
    if (commit && !['true', 'false'].includes(commit))
      throw new Error('auto_commit must be true or false')
    core.setSecret(token)
    const client = githubClient(
      new Octokit({ auth: token, request: { timeout: 30000 } })
    )
    core.info(`Collecting ${config.username} (${config.scope})`)
    // All network work finishes before any output is changed.
    const snapshot = await collectStats(client, config, new Date(), core.info)
    const files = writeOutput(planOutput(root, snapshot, config))
    const s = snapshot
    const outputs = {
      stars_count: s.totals.stars,
      commits_count: s.profile.commits,
      issues_count: s.totals.issues,
      prs_count: s.totals.pullRequests,
      repositories_count: s.totals.repositories,
      followers_count: s.profile.followers,
      following_count: s.profile.following,
      contributed_to_count: s.profile.contributedTo,
      contributions_count: s.profile.contributions,
      watchers_count: s.totals.watchers,
      top_language: s.totals.topLanguage,
      days_active: Math.max(
        0,
        Math.floor(
          (Date.parse(s.collectedAt) - Date.parse(s.profile.createdAt)) /
            86400000
        )
      ),
      developer_grade: s.rating.grade,
      developer_score: s.rating.score,
      issue_close_rate: Math.round(s.totals.issueCloseRate),
      pr_merge_rate: Math.round(s.totals.prMergeRate),
      card_path: `${config.output.directory}/profile-light.svg`,
      stats_path: `${config.output.directory}/stats.json`,
      changed: files.length > 0
    }
    for (const [key, value] of Object.entries(outputs))
      core.setOutput(key, value)
    if (commit !== 'false' && files.length) {
      await commitAndPush(
        root,
        files,
        `Update Star Track profile [${s.rating.grade}, ${s.rating.score}]`
      )
      core.info('Profile generated, committed and pushed successfully.')
    } else
      core.info(
        files.length
          ? 'Profile generated. Automatic commit disabled.'
          : 'Profile is unchanged.'
      )
    if (process.env.GITHUB_STEP_SUMMARY)
      await core.summary.addRaw(summary(snapshot, config)).write()
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  } finally {
    core.setOutput('execution_time', Math.round((Date.now() - start) / 1000))
  }
}
