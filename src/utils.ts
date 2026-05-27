import * as core from '@actions/core'
import * as github from '@actions/github'
import { retry } from '@octokit/plugin-retry'
import { throttling } from '@octokit/plugin-throttling'
import parseDuration from 'parse-duration'

export type GitHub = ReturnType<typeof github.getOctokit>

export type Artifact = Awaited<
  ReturnType<GitHub['rest']['actions']['listArtifactsForRepo']>
>['data']['artifacts'][number]

export interface IActionInputs {
  expireInMs: number
  onlyPrefix: string
  exceptPrefix: string
}

export function getOctokit(): GitHub {
  const token = core.getInput('token', { required: true })
  return github.getOctokit(
    token,
    {
      throttle: {
        onRateLimit(
          retryAfter: number,
          options: { method: string; url: string },
          _octokit: unknown,
          retryCount: number
        ) {
          core.warning(
            `Rate limit hit for ${options.method} ${options.url}; retrying after ${retryAfter}s (attempt ${retryCount + 1}).`
          )
          return retryCount < 3
        },
        onSecondaryRateLimit(
          retryAfter: number,
          options: { method: string; url: string },
          _octokit: unknown,
          retryCount: number
        ) {
          core.warning(
            `Secondary rate limit hit for ${options.method} ${options.url}; retrying after ${retryAfter}s (attempt ${retryCount + 1}).`
          )
          return retryCount < 3
        }
      }
    },
    retry,
    throttling
  )
}

export function getActionInputs(): IActionInputs {
  const expireInHumanReadable = core.getInput('expire-in', { required: true })
  const expireInMs = parseDuration(expireInHumanReadable)
  if (expireInMs === null) {
    throw new Error(
      `Unable to parse "expire-in" value: "${expireInHumanReadable}"`
    )
  }
  const onlyPrefix = core.getInput('onlyPrefix')
  const exceptPrefix = core.getInput('exceptPrefix')

  return { expireInMs, onlyPrefix, exceptPrefix }
}

export async function* eachArtifact(octokit: GitHub): AsyncGenerator<Artifact> {
  const { owner, repo } = github.context.repo
  let hasNextPage = false
  let currentPage = 1
  const maxPerPage = 100
  do {
    const response = await octokit.rest.actions.listArtifactsForRepo({
      owner,
      repo,
      page: currentPage,
      per_page: maxPerPage
    })
    hasNextPage = response.data.total_count / maxPerPage > currentPage
    for (const artifact of response.data.artifacts) {
      yield artifact
    }
    currentPage++
  } while (hasNextPage)
}
