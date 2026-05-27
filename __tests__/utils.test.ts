import { jest } from '@jest/globals'
import { eachArtifact } from '../src/utils.js'

process.env.GITHUB_REPOSITORY = 'kolpav/purge-artifacts-action'

describe('eachArtifact', () => {
  test('called with correct arguments', async () => {
    const octokit = {
      rest: {
        actions: {
          listArtifactsForRepo: jest.fn(async () => ({
            data: {
              artifacts: [],
              total_count: 0
            }
          }))
        }
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const artifact of eachArtifact(octokit as any)) {
    }
    expect(octokit.rest.actions.listArtifactsForRepo).toHaveBeenCalledWith({
      owner: 'kolpav',
      repo: 'purge-artifacts-action',
      page: 1,
      per_page: 100
    })
  })
  test('iterates over all artifacts', async () => {
    const maxPerPage = 100
    const totalCount = 117
    const artifacts = []
    for (let i = 0; i < totalCount; i++) {
      artifacts[i] = i
    }
    const firstListArtifactsForRepoResponse = {
      data: {
        artifacts: artifacts.slice(0, maxPerPage),
        total_count: totalCount
      }
    }
    const secondListArtifactsForRepoResponse = {
      data: {
        artifacts: artifacts.slice(maxPerPage, artifacts.length),
        total_count: totalCount
      }
    }
    type ListResponse = { data: { artifacts: number[]; total_count: number } }
    const listArtifactsForRepoMock = jest
      .fn<() => Promise<ListResponse>>()
      .mockResolvedValueOnce(firstListArtifactsForRepoResponse)
      .mockResolvedValueOnce(secondListArtifactsForRepoResponse)
    const octokit = {
      rest: {
        actions: {
          listArtifactsForRepo: listArtifactsForRepoMock
        }
      }
    }
    let artifactIndex = 0
    for await (const artifact of eachArtifact(octokit as any)) {
      expect(artifact).toEqual(artifacts[artifactIndex++])
    }
  })
})
