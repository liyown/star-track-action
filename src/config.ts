import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { parseDocument } from 'yaml'
import { z } from 'zod'

const login = z
  .string()
  .regex(/^[a-z\d](?:[a-z\d-]{0,38})$/i, 'Invalid GitHub login')
const repoName = z
  .string()
  .regex(/^[a-z\d-]+\/[a-z\d_.-]+$/i, 'Use owner/repository')
const copy = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (s) => !/[\x00-\x1f\x7f]/.test(s),
      'Control characters are not allowed'
    )
const featured = z.union([
  repoName.transform((repo) => ({
    repo,
    description: undefined as string | undefined
  })),
  z.object({ repo: repoName, description: copy(160).optional() }).strict()
])

export const configSchema = z
  .object({
    username: login,
    scope: z.enum(['personal', 'all']).default('personal'),
    organizations: z.array(login).max(50).optional(),
    profile: z
      .object({
        name: copy(60).optional(),
        headline: copy(100).default('把想法，做成开源作品。'),
        initials: copy(3).optional()
      })
      .strict()
      .default({}),
    repositories: z
      .object({
        include_forks: z.boolean().default(false),
        include_archived: z.boolean().default(true),
        exclude: z.array(repoName).default([])
      })
      .strict()
      .default({}),
    featured: z.array(featured).max(6).default([]),
    appearance: z
      .object({
        theme: z.enum(['auto', 'light', 'dark']).default('auto'),
        locale: z.enum(['zh-CN', 'en']).default('zh-CN'),
        title: copy(80).default('OPEN SOURCE PROFILE')
      })
      .strict()
      .default({}),
    rating: z
      .object({ enabled: z.boolean().default(true) })
      .strict()
      .default({}),
    output: z
      .object({
        directory: z.string().min(1).default('assets/star-track'),
        readme: z.string().min(1).default('README.md')
      })
      .strict()
      .default({})
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.scope === 'personal' && value.organizations?.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'organizations requires scope: all',
        path: ['organizations']
      })
    }
    const names = value.featured.map((item) => item.repo.toLowerCase())
    if (new Set(names).size !== names.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Duplicate featured repository',
        path: ['featured']
      })
  })

export type Config = z.infer<typeof configSchema>
export interface Overrides {
  username?: string
  scope?: string
  readme?: string
  title?: string
}

/** Reject traversal and symlinks before either reading configuration or writing output. */
export function workspacePath(root: string, relative: string): string {
  if (path.isAbsolute(relative) || /[\x00-\x1f\x7f]/.test(relative))
    throw new Error(`Expected a workspace-relative path: ${relative}`)
  const target = path.resolve(root, relative)
  const rel = path.relative(path.resolve(root), target)
  if (!rel || rel.startsWith(`..${path.sep}`) || rel === '..')
    throw new Error(`Path escapes workspace or targets its root: ${relative}`)
  for (const part of rel.split(path.sep)) {
    if (part === '.git') throw new Error('Paths inside .git are not allowed')
  }
  let current = path.resolve(root)
  for (const part of rel.split(path.sep)) {
    current = path.join(current, part)
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
      throw new Error(`Symlink paths are not allowed: ${relative}`)
  }
  return target
}

export function loadConfig(
  root: string,
  file = 'star-track.yml',
  overrides: Overrides = {},
  required = false
): Config {
  const target = workspacePath(root, file)
  let source: Record<string, unknown> = {}
  if (fs.existsSync(target)) {
    const document = parseDocument(fs.readFileSync(target, 'utf8'), {
      uniqueKeys: true
    })
    if (document.errors.length)
      throw new Error(`Invalid YAML: ${document.errors[0].message}`)
    const parsed: unknown = document.toJS({ maxAliasCount: 20 })
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('Configuration must be a YAML mapping')
    source = parsed as Record<string, unknown>
  } else if (required) throw new Error(`Configuration file not found: ${file}`)
  if (overrides.username) source.username = overrides.username
  if (overrides.scope) source.scope = overrides.scope
  // Validate the YAML before merging nested legacy inputs, so malformed sections cannot be hidden.
  let config = configSchema.parse(source)
  config = configSchema.parse({
    ...config,
    output: {
      ...config.output,
      ...(overrides.readme ? { readme: overrides.readme } : {})
    },
    appearance: {
      ...config.appearance,
      ...(overrides.title ? { title: overrides.title } : {})
    }
  })
  const directory = workspacePath(root, config.output.directory)
  const readme = workspacePath(root, config.output.readme)
  if (readme === directory || readme.startsWith(`${directory}${path.sep}`))
    throw new Error('README must be outside the generated output directory')
  return config
}

export function sourceKey(config: Config): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        username: config.username.toLowerCase(),
        scope: config.scope,
        organizations: config.organizations?.map((s) => s.toLowerCase()).sort(),
        repositories: {
          ...config.repositories,
          exclude: config.repositories.exclude
            .map((s) => s.toLowerCase())
            .sort()
        }
      })
    )
    .digest('hex')
    .slice(0, 16)
}
