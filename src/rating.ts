import type { Profile, Rating, Repository } from './types.js'

export const GRADES = [
  ['D-', 0],
  ['D', 5],
  ['D+', 10],
  ['C-', 20],
  ['C', 30],
  ['C+', 40],
  ['B-', 60],
  ['B', 80],
  ['B+', 100],
  ['A-', 150],
  ['A', 200],
  ['A+', 300],
  ['S-', 500],
  ['S', 800],
  ['S+', 1200],
  ['SS', 2000],
  ['SS+', 3500],
  ['SSS', 5000]
] as const

/** v2 is an open-source impact score, not a ranking of individual ability. */
export function calculateRating(
  profile: Profile,
  repos: Repository[],
  date: string
): Rating {
  const stars = repos.reduce((sum, repo) => sum + repo.stars, 0)
  const forks = repos.reduce((sum, repo) => sum + repo.forks, 0)
  const starsPerRepo = repos.length ? stars / repos.length : 0
  const ageYears = Math.max(
    0,
    (Date.parse(date) - Date.parse(profile.createdAt)) / 31557600000
  )
  const breakdown = {
    repositories: repos.length,
    stars: stars * 0.5,
    commits: Math.min(profile.commits * 0.1, 300),
    issues: Math.min(profile.issues * 0.05, 50),
    pullRequests: Math.min(profile.pullRequests * 0.1, 50),
    followers: profile.followers * 0.3,
    contributedRepositories: profile.contributedTo * 2,
    forks: forks * 0.2,
    starMilestone:
      stars >= 10000
        ? 2000
        : stars >= 5000
          ? 1000
          : stars >= 1000
            ? 500
            : stars >= 500
              ? 200
              : stars >= 100
                ? 50
                : 0,
    averageStars: Math.min(starsPerRepo * 2, 100),
    longevity: Math.min(ageYears * 5, 25)
  }
  const score = Math.round(Object.values(breakdown).reduce((a, b) => a + b, 0))
  let index = 0
  for (let i = 0; i < GRADES.length; i++) if (score >= GRADES[i][1]) index = i
  const current = GRADES[index]
  const next = GRADES[index + 1]
  return {
    version: 'v2',
    grade: current[0],
    score,
    nextGrade: next?.[0] ?? null,
    nextScore: next?.[1] ?? null,
    progress: next ? (score - current[1]) / (next[1] - current[1]) : 1,
    breakdown: Object.fromEntries(
      Object.entries(breakdown).map(([key, value]) => [
        key,
        Math.round(value * 100) / 100
      ])
    )
  }
}
