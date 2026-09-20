export interface Repository {
  name: string
  owner: string
  fullName: string
  description: string
  url: string
  language: string
  stars: number
  forks: number
  watchers: number
  issues: number
  closedIssues: number
  pullRequests: number
  mergedPullRequests: number
  isFork: boolean
  isArchived: boolean
  createdAt: string
}

export interface Profile {
  login: string
  name: string
  followers: number
  following: number
  createdAt: string
  contributedTo: number
  contributions: number
  commits: number
  issues: number
  pullRequests: number
  reviews: number
  calendar: { date: string; count: number }[]
}

export interface Rating {
  version: 'v2'
  grade: string
  score: number
  nextGrade: string | null
  nextScore: number | null
  progress: number
  breakdown: Record<string, number>
}

export interface Snapshot {
  schemaVersion: 2
  sourceKey: string
  collectedAt: string
  window: { from: string; to: string }
  scope: { username: string; organizations: string[] }
  profile: Profile
  repositories: Repository[]
  featured: Repository[]
  totals: {
    stars: number
    repositories: number
    forks: number
    watchers: number
    issues: number
    pullRequests: number
    issueCloseRate: number
    prMergeRate: number
    topLanguage: string
    languages: Record<string, number>
  }
  rating: Rating
}
