/**
 * The public base path shared by the Vite build, the Playwright tests, and the PWA build check.
 *
 * - VITE_BASE_PATH wins when set (custom domains, other hosts).
 * - On GitHub Actions the repository name is used, except for <owner>.github.io repositories,
 *   which GitHub Pages serves from the domain root.
 * - Locally it defaults to /GymBuddie/, matching the production URL.
 */
export function resolveBasePath(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.VITE_BASE_PATH?.trim()
  if (explicit) return `/${explicit.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/')

  const [owner, repositoryName] = env.GITHUB_REPOSITORY?.split('/') ?? []
  if (!repositoryName) return '/GymBuddie/'
  // Only a repository named exactly <owner>.github.io is a user site served from the root.
  if (repositoryName.toLowerCase() === `${owner?.toLowerCase()}.github.io`) return '/'
  return `/${repositoryName}/`
}
