import * as core from '@actions/core'
import * as github from '@actions/github'
import {
  getOctokit,
  eachArtifact,
  getActionInputs,
  type Artifact,
  type IActionInputs
} from './utils.js'

export function shouldDelete(
  artifact: Artifact,
  actionInputs: IActionInputs
): boolean {
  const { expireInMs, onlyPrefix, exceptPrefix } = actionInputs

  const included = onlyPrefix === '' || artifact.name.startsWith(onlyPrefix)
  const excluded = exceptPrefix !== '' && artifact.name.startsWith(exceptPrefix)
  const ageInMs = Date.now() - new Date(artifact.created_at ?? 0).getTime()
  const expired = ageInMs >= expireInMs

  return included && !excluded && expired
}

export async function main(): Promise<void> {
  try {
    const actionInputs = getActionInputs()

    const octokit = getOctokit()

    const deletedArtifacts: Artifact[] = []
    for await (const artifact of eachArtifact(octokit)) {
      if (shouldDelete(artifact, actionInputs)) {
        deletedArtifacts.push(artifact)
        core.debug(`Deleting artifact:\n${JSON.stringify(artifact, null, 2)}`)
        await octokit.rest.actions.deleteArtifact({
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          artifact_id: artifact.id
        })
      }
    }
    core.setOutput('deleted-artifacts', JSON.stringify(deletedArtifacts))
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}
