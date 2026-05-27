import * as core from '@actions/core'
import * as github from '@actions/github'
import {
  getOctokit,
  eachArtifact,
  getActionInputs,
  type Artifact,
  type GitHub,
  type IActionInputs
} from './utils.js'

const DELETE_CONCURRENCY = 5

export interface PurgeResult {
  deleted: Artifact[]
  failed: { artifact: Artifact; error: unknown }[]
}

export function shouldDelete(
  artifact: Artifact,
  actionInputs: IActionInputs
): boolean {
  const { expireInMs, onlyPrefix, exceptPrefix } = actionInputs

  if (artifact.created_at == null) {
    return false
  }

  const included = onlyPrefix === '' || artifact.name.startsWith(onlyPrefix)
  const excluded = exceptPrefix !== '' && artifact.name.startsWith(exceptPrefix)
  const ageInMs = Date.now() - new Date(artifact.created_at).getTime()
  const expired = ageInMs >= expireInMs

  return included && !excluded && expired
}

export async function purgeArtifacts(
  octokit: GitHub,
  actionInputs: IActionInputs
): Promise<PurgeResult> {
  const { owner, repo } = github.context.repo

  const candidates: Artifact[] = []
  for await (const artifact of eachArtifact(octokit)) {
    if (shouldDelete(artifact, actionInputs)) {
      candidates.push(artifact)
    }
  }

  const deleted: Artifact[] = []
  const failed: { artifact: Artifact; error: unknown }[] = []

  let next = 0
  async function worker(): Promise<void> {
    while (next < candidates.length) {
      const artifact = candidates[next++]
      try {
        core.debug(`Deleting artifact ${artifact.name} (id ${artifact.id})`)
        await octokit.rest.actions.deleteArtifact({
          owner,
          repo,
          artifact_id: artifact.id
        })
        deleted.push(artifact)
      } catch (error) {
        core.warning(
          `Failed to delete artifact ${artifact.name} (id ${artifact.id}): ${
            error instanceof Error ? error.message : String(error)
          }`
        )
        failed.push({ artifact, error })
      }
    }
  }

  const workerCount = Math.min(DELETE_CONCURRENCY, candidates.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  return { deleted, failed }
}

export async function main(): Promise<void> {
  try {
    const actionInputs = getActionInputs()
    const octokit = getOctokit()

    const { deleted, failed } = await purgeArtifacts(octokit, actionInputs)

    core.setOutput('deleted-artifacts', JSON.stringify(deleted))
    core.info(`Deleted ${deleted.length} artifact(s).`)

    if (failed.length > 0) {
      core.setFailed(`Failed to delete ${failed.length} artifact(s).`)
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}
