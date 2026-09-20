import { configSchema } from '../src/config.js'
import { buildSnapshot } from '../src/github.js'
import type { Profile, Repository } from '../src/types.js'

export const demoConfig = configSchema.parse({
  username: 'liyown',
  scope: 'all',
  organizations: ['OpenAISpace'],
  profile: {
    name: 'Liuyaowen',
    initials: 'LY',
    headline: '把想法，做成开源作品。'
  },
  featured: [
    'liyown/project-alpha',
    'OpenAISpace/project-beta',
    'OpenAISpace/project-gamma'
  ]
})
export const demoDate = '2026-09-20T00:00:00.000Z'
export const demoProfile: Profile = {
  login: 'liyown',
  name: 'Liuyaowen',
  followers: 47,
  following: 28,
  createdAt: '2020-02-01T00:00:00Z',
  contributedTo: 12,
  contributions: 1240,
  commits: 1016,
  issues: 68,
  pullRequests: 55,
  reviews: 24,
  calendar: Array.from({ length: 365 }, (_, i) => ({
    date: new Date(Date.parse(demoDate) - (364 - i) * 86400000)
      .toISOString()
      .slice(0, 10),
    count: (i * 7 + Math.floor(i / 8) * 3) % 19
  }))
}
export function repository(overrides: Partial<Repository> = {}): Repository {
  return {
    name: 'project-alpha',
    owner: 'liyown',
    fullName: 'liyown/project-alpha',
    description: '让日常工作更简单',
    url: 'https://github.com/liyown/project-alpha',
    language: 'TypeScript',
    stars: 2160,
    forks: 150,
    watchers: 28,
    issues: 42,
    closedIssues: 38,
    pullRequests: 25,
    mergedPullRequests: 18,
    isFork: false,
    isArchived: false,
    createdAt: '2020-02-01T00:00:00Z',
    ...overrides
  }
}
export const demoRepositories = [
  repository(),
  repository({
    name: 'project-beta',
    owner: 'OpenAISpace',
    fullName: 'OpenAISpace/project-beta',
    url: 'https://github.com/OpenAISpace/project-beta',
    description: '连接想法与工具',
    stars: 1340
  }),
  repository({
    name: 'project-gamma',
    owner: 'OpenAISpace',
    fullName: 'OpenAISpace/project-gamma',
    url: 'https://github.com/OpenAISpace/project-gamma',
    description: '探索新的开发体验',
    language: 'Swift',
    stars: 780
  }),
  ...Array.from({ length: 69 }, (_, i) =>
    repository({
      name: `archive-${i}`,
      fullName: `liyown/archive-${i}`,
      url: `https://github.com/liyown/archive-${i}`,
      stars: 0,
      forks: 0,
      watchers: 0,
      issues: 0,
      closedIssues: 0,
      pullRequests: 0,
      mergedPullRequests: 0
    })
  )
]
export const demoSnapshot = buildSnapshot(
  demoConfig,
  demoProfile,
  demoRepositories,
  ['OpenAISpace'],
  demoDate,
  '2025-09-20T00:00:00.000Z'
)
