import type { Octokit } from '@octokit/rest'
import { sourceKey, type Config } from './config.js'
import { calculateRating } from './rating.js'
import type { Profile, Repository, Snapshot } from './types.js'

interface Connection<T> {
  nodes: T[]
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
}
interface RepositoryNode {
  name: string
  nameWithOwner: string
  description: string | null
  url: string
  stargazerCount: number
  forkCount: number
  isFork: boolean
  isArchived: boolean
  createdAt: string
  primaryLanguage: { name: string } | null
  watchers: { totalCount: number }
  issues: { totalCount: number }
  closedIssues: { totalCount: number }
  pullRequests: { totalCount: number }
  mergedPullRequests: { totalCount: number }
}

export const REPOSITORIES_QUERY = `query StarTrackRepositories($owner: String!, $cursor: String) {
  repositoryOwner(login: $owner) {
    repositories(first: 50, after: $cursor, privacy: PUBLIC, ownerAffiliations: [OWNER], orderBy: {field: NAME, direction: ASC}) {
      nodes {
        name nameWithOwner description url stargazerCount forkCount isFork isArchived createdAt
        primaryLanguage { name } watchers { totalCount }
        issues { totalCount } closedIssues: issues(states: [CLOSED]) { totalCount }
        pullRequests { totalCount } mergedPullRequests: pullRequests(states: [MERGED]) { totalCount }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

export const PROFILE_QUERY = `query StarTrackProfile($username: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $username) {
    login name createdAt followers { totalCount } following { totalCount }
    repositoriesContributedTo(first: 1, privacy: PUBLIC, includeUserRepositories: true) { totalCount }
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions totalIssueContributions totalPullRequestContributions totalPullRequestReviewContributions
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
    }
  }
}`

interface UserNode {
  login: string
  name: string | null
  createdAt: string
  followers: { totalCount: number }
  following: { totalCount: number }
  repositoriesContributedTo: { totalCount: number }
  contributionsCollection: {
    totalCommitContributions: number
    totalIssueContributions: number
    totalPullRequestContributions: number
    totalPullRequestReviewContributions: number
    contributionCalendar: {
      totalContributions: number
      weeks: {
        contributionDays: { date: string; contributionCount: number }[]
      }[]
    }
  }
}

export interface GitHubClient {
  graphql<T>(query: string, variables: Record<string, unknown>): Promise<T>
  organizations(username: string): Promise<string[]>
}

/** Retry transient failures only; pagination never returns a partial success. */
export async function withRetry<T>(
  request: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms))
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await request()
    } catch (error) {
      const e = error as {
        status?: number
        response?: { headers?: Record<string, string> }
        message?: string
      }
      const retryAfter = Number(e.response?.headers?.['retry-after'] ?? 0)
      const transient =
        e.status === 429 ||
        (e.status !== undefined && e.status >= 500) ||
        (e.status === 403 && retryAfter > 0)
      if (!transient || attempt >= 2 || retryAfter > 30) throw error
      await sleep(Math.max(retryAfter * 1000, 1000 * 2 ** attempt))
    }
  }
}

export function githubClient(octokit: Octokit): GitHubClient {
  return {
    graphql: <T>(query: string, variables: Record<string, unknown>) =>
      withRetry(() => octokit.graphql<T>(query, variables)),
    organizations: (username) =>
      withRetry(async () => {
        const orgs = await octokit.paginate(octokit.orgs.listForUser, {
          username,
          per_page: 100
        })
        return orgs.map((org) => org.login)
      })
  }
}

export async function fetchRepositories(
  client: GitHubClient,
  owner: string
): Promise<Repository[]> {
  const repos: Repository[] = []
  let cursor: string | null = null
  const seen = new Set<string>()
  for (;;) {
    const response: {
      repositoryOwner: { repositories: Connection<RepositoryNode> } | null
    } = await client.graphql(REPOSITORIES_QUERY, { owner, cursor })
    if (!response.repositoryOwner)
      throw new Error(`GitHub owner not found: ${owner}`)
    const page = response.repositoryOwner.repositories
    for (const repo of page.nodes) {
      if (!repo) throw new Error(`Incomplete repository response for ${owner}`)
      repos.push({
        name: repo.name,
        owner: repo.nameWithOwner.split('/')[0],
        fullName: repo.nameWithOwner,
        description: repo.description ?? '',
        url: repo.url,
        language: repo.primaryLanguage?.name ?? '—',
        stars: repo.stargazerCount,
        forks: repo.forkCount,
        watchers: repo.watchers.totalCount,
        issues: repo.issues.totalCount,
        closedIssues: repo.closedIssues.totalCount,
        pullRequests: repo.pullRequests.totalCount,
        mergedPullRequests: repo.mergedPullRequests.totalCount,
        isFork: repo.isFork,
        isArchived: repo.isArchived,
        createdAt: repo.createdAt
      })
    }
    if (!page.pageInfo.hasNextPage) return repos
    cursor = page.pageInfo.endCursor
    if (!cursor || seen.has(cursor))
      throw new Error(`Invalid pagination cursor for ${owner}`)
    seen.add(cursor)
  }
}

export function buildSnapshot(
  config: Config,
  profile: Profile,
  repositories: Repository[],
  organizations: string[],
  collectedAt: string,
  from: string
): Snapshot {
  const excluded = new Set(
    config.repositories.exclude.map((name) => name.toLowerCase())
  )
  const repos = [
    ...new Map(
      repositories.map((repo) => [repo.fullName.toLowerCase(), repo])
    ).values()
  ]
    .filter(
      (repo) =>
        (config.repositories.include_forks || !repo.isFork) &&
        (config.repositories.include_archived || !repo.isArchived) &&
        !excluded.has(repo.fullName.toLowerCase())
    )
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'en'))
  const sum = (
    key:
      | 'stars'
      | 'forks'
      | 'watchers'
      | 'issues'
      | 'closedIssues'
      | 'pullRequests'
      | 'mergedPullRequests'
  ) => repos.reduce((total, repo) => total + repo[key], 0)
  const languages: Record<string, number> = {}
  for (const repo of repos)
    if (repo.language !== '—')
      languages[repo.language] = (languages[repo.language] ?? 0) + 1
  const topLanguage =
    Object.entries(languages).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en')
    )[0]?.[0] ?? 'None'
  const selected = config.featured.length
    ? config.featured.map((item) => {
        const repo = repos.find(
          (repo) => repo.fullName.toLowerCase() === item.repo.toLowerCase()
        )
        if (!repo)
          throw new Error(
            `Featured repository ${item.repo} is outside the selected public scope or excluded. Check organizations and repository filters.`
          )
        return { ...repo, description: item.description ?? repo.description }
      })
    : [...repos]
        .sort(
          (a, b) =>
            b.stars - a.stars || a.fullName.localeCompare(b.fullName, 'en')
        )
        .slice(0, 3)
  return {
    schemaVersion: 2,
    sourceKey: sourceKey(config),
    collectedAt,
    window: { from, to: collectedAt },
    scope: { username: profile.login, organizations },
    profile,
    repositories: repos,
    featured: selected,
    totals: {
      stars: sum('stars'),
      repositories: repos.length,
      forks: sum('forks'),
      watchers: sum('watchers'),
      issues: sum('issues'),
      pullRequests: sum('pullRequests'),
      issueCloseRate: sum('issues')
        ? (sum('closedIssues') / sum('issues')) * 100
        : 0,
      prMergeRate: sum('pullRequests')
        ? (sum('mergedPullRequests') / sum('pullRequests')) * 100
        : 0,
      topLanguage,
      languages
    },
    rating: calculateRating(profile, repos, collectedAt)
  }
}

export async function collectStats(
  client: GitHubClient,
  config: Config,
  now = new Date(),
  log: (message: string) => void = () => {}
): Promise<Snapshot> {
  const to = now.toISOString()
  // 365 days avoids an invalid >1-year GraphQL interval around leap days.
  const from = new Date(now.getTime() - 365 * 86400000).toISOString()
  const { user } = await client.graphql<{ user: UserNode | null }>(
    PROFILE_QUERY,
    { username: config.username, from, to }
  )
  if (!user) throw new Error(`GitHub user not found: ${config.username}`)
  const c = user.contributionsCollection
  const profile: Profile = {
    login: user.login,
    name: user.name || user.login,
    createdAt: user.createdAt,
    followers: user.followers.totalCount,
    following: user.following.totalCount,
    contributedTo: user.repositoriesContributedTo.totalCount,
    contributions: c.contributionCalendar.totalContributions,
    commits: c.totalCommitContributions,
    issues: c.totalIssueContributions,
    pullRequests: c.totalPullRequestContributions,
    reviews: c.totalPullRequestReviewContributions,
    calendar: c.contributionCalendar.weeks
      .flatMap((week) =>
        week.contributionDays.map((day) => ({
          date: day.date,
          count: day.contributionCount
        }))
      )
      .filter((day) => day.date <= to.slice(0, 10))
  }
  const organizations =
    config.scope === 'all'
      ? [
          ...new Set(
            (
              config.organizations ?? (await client.organizations(user.login))
            ).map((org) => org.toLowerCase())
          )
        ]
          .filter((org) => org !== user.login.toLowerCase())
          .sort()
      : []
  const repos: Repository[] = []
  for (const owner of [user.login, ...organizations]) {
    log(`Collecting public repositories: ${owner}`)
    repos.push(...(await fetchRepositories(client, owner)))
  }
  return buildSnapshot(config, profile, repos, organizations, to, from)
}
