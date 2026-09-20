import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'

const exec = promisify(execFile)
export async function commitAndPush(
  root: string,
  files: string[],
  message: string
): Promise<void> {
  if (!files.length) return
  const git = (args: string[]) =>
    exec('git', args, {
      cwd: root,
      env: { ...process.env, GIT_LITERAL_PATHSPECS: '1' }
    })
  await git(['symbolic-ref', '--quiet', '--short', 'HEAD'])
  const { stdout } = await git(['diff', '--cached', '--name-only'])
  if (stdout.trim())
    throw new Error(
      'Refusing to commit with an existing staged change. Use auto_commit: false and manage commits in the workflow.'
    )
  const relative = files.map((file) => path.relative(root, file))
  await git(['add', '--', ...relative])
  const staged = await git(['diff', '--cached', '--name-only'])
  if (!staged.stdout.trim()) return
  await git([
    '-c',
    'user.name=github-actions[bot]',
    '-c',
    'user.email=41898282+github-actions[bot]@users.noreply.github.com',
    'commit',
    '-m',
    message
  ])
  // A failed push is a failed action, never a success message.
  await git(['push'])
}
