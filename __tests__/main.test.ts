import { jest } from '@jest/globals'
import { shouldDelete, purgeArtifacts } from '../src/main.js'
import { sub } from 'date-fns'
import { IActionInputs } from '../src/utils.js'

describe('shouldDelete', () => {
  test('expired', () => {
    const days = 2
    const expireInMs = days * 86400000
    const expiredArtifact = { created_at: sub(new Date(), { days }) }
    const actionInptus: IActionInputs = {
      expireInMs,
      onlyPrefix: '',
      exceptPrefix: ''
    }
    expect(shouldDelete(expiredArtifact as any, actionInptus)).toEqual(true)
  })
  test('not expired', () => {
    const days = 2
    const expireInMs = (days + 1) * 86400000
    const expiredArtifact = { created_at: sub(new Date(), { days }) }
    const actionInptus: IActionInputs = {
      expireInMs,
      onlyPrefix: '',
      exceptPrefix: ''
    }
    expect(shouldDelete(expiredArtifact as any, actionInptus)).toEqual(false)
  })
  test('expired when expireInDays is zero', () => {
    const expiredArtifact = { created_at: new Date() }
    const actionInptus: IActionInputs = {
      expireInMs: 0,
      onlyPrefix: '',
      exceptPrefix: ''
    }
    expect(shouldDelete(expiredArtifact as any, actionInptus)).toEqual(true)
  })
  test('should delete when matched by onlyPrefix', () => {
    const expiredArtifact = {
      created_at: new Date(),
      name: 'tmp_artifact.test'
    }
    const actionInptus: IActionInputs = {
      expireInMs: 0,
      onlyPrefix: 'tmp',
      exceptPrefix: ''
    }
    expect(shouldDelete(expiredArtifact as any, actionInptus)).toEqual(true)
  })
  test('should not delete when not matched by onlyPrefix', () => {
    const expiredArtifact = {
      created_at: new Date(),
      name: 'build_artifact.test'
    }
    const actionInptus: IActionInputs = {
      expireInMs: 0,
      onlyPrefix: 'tmp',
      exceptPrefix: ''
    }
    expect(shouldDelete(expiredArtifact as any, actionInptus)).toEqual(false)
  })
  test('should delete when not matched by exceptPrefix', () => {
    const expiredArtifact = {
      created_at: new Date(),
      name: 'tmp_artifact.test'
    }
    const actionInptus: IActionInputs = {
      expireInMs: 0,
      onlyPrefix: '',
      exceptPrefix: 'master_'
    }
    expect(shouldDelete(expiredArtifact as any, actionInptus)).toEqual(true)
  })
  test('should not delete when matched by exceptPrefix', () => {
    const expiredArtifact = {
      created_at: new Date(),
      name: 'master_artifact.test'
    }
    const actionInptus: IActionInputs = {
      expireInMs: 0,
      onlyPrefix: '',
      exceptPrefix: 'master_'
    }
    expect(shouldDelete(expiredArtifact as any, actionInptus)).toEqual(false)
  })
  test('should not delete when matched by both onlyPrefix and exceptPrefix', () => {
    const expiredArtifact = {
      created_at: new Date(),
      name: 'master_tmp_artifact.test'
    }
    const actionInptus: IActionInputs = {
      expireInMs: 0,
      onlyPrefix: 'master_',
      exceptPrefix: 'master_tmp_'
    }
    expect(shouldDelete(expiredArtifact as any, actionInptus)).toEqual(false)
  })
  test('should delete when matched by onlyPrefix but not exceptPrefix', () => {
    const expiredArtifact = {
      created_at: new Date(),
      name: 'master_tmp_artifact.test'
    }
    const actionInptus: IActionInputs = {
      expireInMs: 0,
      onlyPrefix: 'master_',
      exceptPrefix: 'tmp_'
    }
    expect(shouldDelete(expiredArtifact as any, actionInptus)).toEqual(true)
  })
})

describe('purgeArtifacts', () => {
  process.env.GITHUB_REPOSITORY = 'kolpav/purge-artifacts-action'

  function makeOctokit(
    artifacts: unknown[],
    deleteArtifact: (args: { artifact_id: number }) => Promise<unknown>
  ) {
    return {
      rest: {
        actions: {
          listArtifactsForRepo: jest.fn(async () => ({
            data: { artifacts, total_count: artifacts.length }
          })),
          deleteArtifact: jest.fn(deleteArtifact)
        }
      }
    }
  }

  test('deletes expired candidates and records per-artifact failures', async () => {
    const old = sub(new Date(), { days: 5 }).toISOString()
    const artifacts = [
      { id: 1, name: 'a', created_at: old },
      { id: 2, name: 'b', created_at: old },
      { id: 3, name: 'c', created_at: old }
    ]
    const octokit = makeOctokit(artifacts, async ({ artifact_id }) => {
      if (artifact_id === 2) {
        throw new Error('boom')
      }
      return {}
    })
    const inputs: IActionInputs = {
      expireInMs: 0,
      onlyPrefix: '',
      exceptPrefix: ''
    }

    const result = await purgeArtifacts(octokit as any, inputs)

    expect(result.deleted.map(a => a.id).sort()).toEqual([1, 3])
    expect(result.failed.map(f => f.artifact.id)).toEqual([2])
    expect(octokit.rest.actions.deleteArtifact).toHaveBeenCalledTimes(3)
  })

  test('does not delete artifacts that are not yet expired', async () => {
    const fresh = new Date().toISOString()
    const artifacts = [{ id: 1, name: 'fresh', created_at: fresh }]
    const octokit = makeOctokit(artifacts, async () => ({}))
    const inputs: IActionInputs = {
      expireInMs: 24 * 3600000,
      onlyPrefix: '',
      exceptPrefix: ''
    }

    const result = await purgeArtifacts(octokit as any, inputs)

    expect(result.deleted).toEqual([])
    expect(result.failed).toEqual([])
    expect(octokit.rest.actions.deleteArtifact).not.toHaveBeenCalled()
  })
})
