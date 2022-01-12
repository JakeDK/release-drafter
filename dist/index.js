/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 941:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 189:
/***/ ((module) => {

module.exports = eval("require")("@hapi/joi");


/***/ }),

/***/ 946:
/***/ ((module) => {

module.exports = eval("require")("@probot/adapter-github-actions");


/***/ }),

/***/ 162:
/***/ ((module) => {

module.exports = eval("require")("axios");


/***/ }),

/***/ 456:
/***/ ((module) => {

module.exports = eval("require")("cli-table3");


/***/ }),

/***/ 931:
/***/ ((module) => {

module.exports = eval("require")("compare-versions");


/***/ }),

/***/ 299:
/***/ ((module) => {

module.exports = eval("require")("escape-string-regexp");


/***/ }),

/***/ 496:
/***/ ((module) => {

module.exports = eval("require")("ignore");


/***/ }),

/***/ 348:
/***/ ((module) => {

module.exports = eval("require")("lodash");


/***/ }),

/***/ 621:
/***/ ((module) => {

module.exports = eval("require")("regex-parser");


/***/ }),

/***/ 761:
/***/ ((module) => {

module.exports = eval("require")("semver");


/***/ }),

/***/ 955:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const { getConfig } = __nccwpck_require__(640)
const { isTriggerableReference } = __nccwpck_require__(829)
const {
  findReleases,
  generateReleaseInfo,
  createRelease,
  updateRelease,
} = __nccwpck_require__(373)
const { findCommitsWithAssociatedPullRequests } = __nccwpck_require__(806)
const { sortPullRequests } = __nccwpck_require__(697)
const { log } = __nccwpck_require__(313)
const core = __nccwpck_require__(941)
const { runnerIsActions } = __nccwpck_require__(282)
const ignore = __nccwpck_require__(496)

module.exports = (app, { getRouter }) => {
  if (!runnerIsActions() && typeof getRouter === 'function') {
    getRouter().get('/healthz', (request, response) => {
      response.status(200).json({ status: 'pass' })
    })
  }

  app.on(
    [
      'pull_request.opened',
      'pull_request.reopened',
      'pull_request.synchronize',
      'pull_request.edited',
      'pull_request_target.opened',
      'pull_request_target.reopened',
      'pull_request_target.synchronize',
      'pull_request_target.edited',
    ],
    async (context) => {
      const { disableAutolabeler } = getInput()

      const config = await getConfig({
        context,
        configName: core.getInput('config-name'),
      })

      if (config === null || disableAutolabeler) return

      let issue = {
        ...context.issue({ pull_number: context.payload.pull_request.number }),
      }
      const changedFiles = await context.octokit.paginate(
        context.octokit.pulls.listFiles.endpoint.merge(issue),
        (response) => response.data.map((file) => file.filename)
      )
      const labels = new Set()

      for (const autolabel of config['autolabeler']) {
        let found = false
        // check modified files
        if (!found && autolabel.files.length > 0) {
          const matcher = ignore().add(autolabel.files)
          if (changedFiles.some((file) => matcher.ignores(file))) {
            labels.add(autolabel.label)
            found = true
            log({
              context,
              message: `Found label for files: '${autolabel.label}'`,
            })
          }
        }
        // check branch names
        if (!found && autolabel.branch.length > 0) {
          for (const matcher of autolabel.branch) {
            if (matcher.test(context.payload.pull_request.head.ref)) {
              labels.add(autolabel.label)
              found = true
              log({
                context,
                message: `Found label for branch: '${autolabel.label}'`,
              })
              break
            }
          }
        }
        // check pr title
        if (!found && autolabel.title.length > 0) {
          for (const matcher of autolabel.title) {
            if (matcher.test(context.payload.pull_request.title)) {
              labels.add(autolabel.label)
              found = true
              log({
                context,
                message: `Found label for title: '${autolabel.label}'`,
              })
              break
            }
          }
        }
        // check pr body
        if (
          !found &&
          context.payload.pull_request.body != null &&
          autolabel.body.length > 0
        ) {
          for (const matcher of autolabel.body) {
            if (matcher.test(context.payload.pull_request.body)) {
              labels.add(autolabel.label)
              found = true
              log({
                context,
                message: `Found label for body: '${autolabel.label}'`,
              })
              break
            }
          }
        }
      }

      const labelsToAdd = [...labels]
      if (labelsToAdd.length > 0) {
        let labelIssue = {
          ...context.issue({
            issue_number: context.payload.pull_request.number,
            labels: labelsToAdd,
          }),
        }
        await context.octokit.issues.addLabels(labelIssue)
        if (runnerIsActions()) {
          core.setOutput('number', context.payload.pull_request.number)
          core.setOutput('labels', labelsToAdd.join(','))
        }
        return
      }
    }
  )

  const drafter = async (context) => {
    const {
      shouldDraft,
      configName,
      version,
      tag,
      name,
      disableReleaser,
      commitish,
    } = getInput()

    const config = await getConfig({
      context,
      configName,
    })

    const { isPreRelease } = getInput({ config })

    if (config === null || disableReleaser) return

    // GitHub Actions merge payloads slightly differ, in that their ref points
    // to the PR branch instead of refs/heads/master
    const ref = process.env['GITHUB_REF'] || context.payload.ref

    if (!isTriggerableReference({ ref, context, config })) {
      return
    }

    const { draftRelease, lastRelease } = await findReleases({
      ref,
      context,
      config,
    })
    const { commits, pullRequests: mergedPullRequests } =
      await findCommitsWithAssociatedPullRequests({
        context,
        ref,
        lastRelease,
        config,
      })

    const sortedMergedPullRequests = sortPullRequests(
      mergedPullRequests,
      config['sort-by'],
      config['sort-direction']
    )

    const releaseInfo = generateReleaseInfo({
      commits,
      config,
      lastRelease,
      mergedPullRequests: sortedMergedPullRequests,
      version,
      tag,
      name,
      isPreRelease,
      shouldDraft,
      commitish,
    })

    let createOrUpdateReleaseResponse
    if (!draftRelease) {
      log({ context, message: 'Creating new release' })
      createOrUpdateReleaseResponse = await createRelease({
        context,
        releaseInfo,
        config,
      })
    } else {
      log({ context, message: 'Updating existing release' })
      createOrUpdateReleaseResponse = await updateRelease({
        context,
        draftRelease,
        releaseInfo,
        config,
      })
    }

    if (runnerIsActions()) {
      setActionOutput(createOrUpdateReleaseResponse, releaseInfo)
    }
  }

  if (runnerIsActions()) {
    app.onAny(drafter)
  } else {
    app.on('push', drafter)
  }
}

function getInput({ config } = {}) {
  // Returns all the inputs that doesn't need a merge with the config file
  if (!config) {
    return {
      shouldDraft: core.getInput('publish').toLowerCase() !== 'true',
      configName: core.getInput('config-name'),
      version: core.getInput('version') || undefined,
      tag: core.getInput('tag') || undefined,
      name: core.getInput('name') || undefined,
      disableReleaser:
        core.getInput('disable-releaser').toLowerCase() === 'true',
      disableAutolabeler:
        core.getInput('disable-autolabeler').toLowerCase() === 'true',
      commitish: core.getInput('commitish') || undefined,
    }
  }

  // Merges the config file with the input
  // the input takes precedence, because it's more easy to change at runtime
  const preRelease = core.getInput('prerelease').toLowerCase()
  return {
    isPreRelease: preRelease === 'true' || (!preRelease && config.prerelease),
  }
}

function setActionOutput(releaseResponse, { body }) {
  const {
    data: {
      id: releaseId,
      html_url: htmlUrl,
      upload_url: uploadUrl,
      tag_name: tagName,
      name: name,
    },
  } = releaseResponse
  if (releaseId && Number.isInteger(releaseId))
    core.setOutput('id', releaseId.toString())
  if (htmlUrl) core.setOutput('html_url', htmlUrl)
  if (uploadUrl) core.setOutput('upload_url', uploadUrl)
  if (tagName) core.setOutput('tag_name', tagName)
  if (name) core.setOutput('name', name)
  core.setOutput('body', body)
}


/***/ }),

/***/ 806:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

const _ = __nccwpck_require__(348)
const { log } = __nccwpck_require__(313)
const { paginate } = __nccwpck_require__(246)

const findCommitsWithAssociatedPullRequestsQuery = /* GraphQL */ `
  query findCommitsWithAssociatedPullRequests(
    $name: String!
    $owner: String!
    $ref: String!
    $withPullRequestBody: Boolean!
    $withPullRequestURL: Boolean!
    $since: GitTimestamp
    $after: String
    $withBaseRefName: Boolean!
    $withHeadRefName: Boolean!
  ) {
    repository(name: $name, owner: $owner) {
      object(expression: $ref) {
        ... on Commit {
          history(first: 100, since: $since, after: $after) {
            totalCount
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              committedDate
              message
              author {
                name
                user {
                  login
                }
              }
              associatedPullRequests(first: 5) {
                nodes {
                  title
                  number
                  url @include(if: $withPullRequestURL)
                  body @include(if: $withPullRequestBody)
                  author {
                    login
                  }
                  baseRepository {
                    nameWithOwner
                  }
                  mergedAt
                  isCrossRepository
                  labels(first: 10) {
                    nodes {
                      name
                    }
                  }
                  baseRefName @include(if: $withBaseRefName)
                  headRefName @include(if: $withHeadRefName)
                }
              }
            }
          }
        }
      }
    }
  }
`

const findCommitsWithAssociatedPullRequests = async ({
  context,
  ref,
  lastRelease,
  config,
}) => {
  const { owner, repo } = context.repo()
  const variables = {
    name: repo,
    owner,
    ref,
    withPullRequestBody: config['change-template'].includes('$BODY'),
    withPullRequestURL: config['change-template'].includes('$URL'),
    withBaseRefName: config['change-template'].includes('$BASE_REF_NAME'),
    withHeadRefName: config['change-template'].includes('$HEAD_REF_NAME'),
  }
  const dataPath = ['repository', 'object', 'history']
  const repoNameWithOwner = `${owner}/${repo}`

  let data, commits
  if (lastRelease) {
    log({
      context,
      message: `Fetching all commits for reference ${ref} since ${lastRelease.created_at}`,
    })

    data = await paginate(
      context.octokit.graphql,
      findCommitsWithAssociatedPullRequestsQuery,
      { ...variables, since: lastRelease.created_at },
      dataPath
    )
    // GraphQL call is inclusive of commits from the specified dates.  This means the final
    // commit from the last tag is included, so we remove this here.
    commits = _.get(data, [...dataPath, 'nodes']).filter(
      (commit) => commit.committedDate != lastRelease.created_at
    )
  } else {
    log({ context, message: `Fetching all commits for reference ${ref}` })

    data = await paginate(
      context.octokit.graphql,
      findCommitsWithAssociatedPullRequestsQuery,
      variables,
      dataPath
    )
    commits = _.get(data, [...dataPath, 'nodes'])
  }

  const pullRequests = _.uniqBy(
    commits.flatMap((commit) => commit.associatedPullRequests.nodes),
    'number'
  ).filter((pr) => pr.baseRepository.nameWithOwner === repoNameWithOwner)

  return { commits, pullRequests }
}

exports.findCommitsWithAssociatedPullRequestsQuery =
  findCommitsWithAssociatedPullRequestsQuery

exports.findCommitsWithAssociatedPullRequests =
  findCommitsWithAssociatedPullRequests


/***/ }),

/***/ 640:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

const core = __nccwpck_require__(941)
const Table = __nccwpck_require__(456)
const { validateSchema } = __nccwpck_require__(240)
const { log } = __nccwpck_require__(313)
const { runnerIsActions } = __nccwpck_require__(282)

const DEFAULT_CONFIG_NAME = 'release-drafter.yml'

async function getConfig({ context, configName }) {
  try {
    const repoConfig = await context.config(
      configName || DEFAULT_CONFIG_NAME,
      null
    )
    if (repoConfig == null) {
      const name = configName || DEFAULT_CONFIG_NAME
      // noinspection ExceptionCaughtLocallyJS
      throw new Error(
        `Configuration file .github/${name} is not found. The configuration file must reside in your default branch.`
      )
    }

    const config = validateSchema(context, repoConfig)

    return config
  } catch (error) {
    log({ context, error, message: 'Invalid config file' })

    if (error.isJoi) {
      log({
        context,
        message:
          'Config validation errors, please fix the following issues in ' +
          (configName || DEFAULT_CONFIG_NAME) +
          ':\n' +
          joiValidationErrorsAsTable(error),
      })
    }

    if (runnerIsActions()) {
      core.setFailed('Invalid config file')
    }
    return null
  }
}

function joiValidationErrorsAsTable(error) {
  const table = new Table({ head: ['Property', 'Error'] })
  for (const { path, message } of error.details) {
    const prettyPath = path
      .map((pathPart) =>
        Number.isInteger(pathPart) ? `[${pathPart}]` : pathPart
      )
      .join('.')
    table.push([prettyPath, message])
  }
  return table.toString()
}

exports.getConfig = getConfig


/***/ }),

/***/ 504:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

const { SORT_BY, SORT_DIRECTIONS } = __nccwpck_require__(697)

const DEFAULT_CONFIG = Object.freeze({
  'name-template': '',
  'tag-template': '',
  'change-template': `* $TITLE (#$NUMBER) @$AUTHOR`,
  'change-title-escapes': '',
  'body-regex-filter': '',
  'no-changes-template': `* No changes`,
  'version-template': `$MAJOR.$MINOR.$PATCH`,
  'version-resolver': {
    major: { labels: [] },
    minor: { labels: [] },
    patch: { labels: [] },
    default: 'patch',
  },
  categories: [],
  'exclude-labels': [],
  'include-labels': [],
  'exclude-contributors': [],
  'no-contributors-template': 'No contributors',
  replacers: [],
  autolabeler: [],
  'sort-by': SORT_BY.mergedAt,
  'sort-direction': SORT_DIRECTIONS.descending,
  prerelease: false,
  'filter-by-commitish': false,
  commitish: '',
  'category-template': `## $TITLE`,
})

exports.DEFAULT_CONFIG = DEFAULT_CONFIG


/***/ }),

/***/ 313:
/***/ ((__unused_webpack_module, exports) => {

const log = ({ context, message, error }) => {
  const repo = context.payload.repository
  const prefix = repo ? `${repo.full_name}: ` : ''
  const logString = `${prefix}${message}`
  if (error) {
    context.log.warn(error, logString)
  } else {
    context.log.info(logString)
  }
}

exports.log = log


/***/ }),

/***/ 246:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

const _ = __nccwpck_require__(348)

/**
 * Utility function to paginate a GraphQL function using Relay-style cursor pagination.
 *
 * @param {Function} queryFn - function used to query the GraphQL API
 * @param {string} query - GraphQL query, must include `nodes` and `pageInfo` fields for the field that will be paginated
 * @param {Object} variables
 * @param {string[]} paginatePath - path to field to paginate
 */
async function paginate(queryFunction, query, variables, paginatePath) {
  const nodesPath = [...paginatePath, 'nodes']
  const pageInfoPath = [...paginatePath, 'pageInfo']
  const endCursorPath = [...pageInfoPath, 'endCursor']
  const hasNextPagePath = [...pageInfoPath, 'hasNextPage']
  const hasNextPage = (data) => _.get(data, hasNextPagePath)

  let data = await queryFunction(query, variables)

  if (!_.has(data, nodesPath)) {
    throw new Error(
      "Data doesn't contain `nodes` field. Make sure the `paginatePath` is set to the field you wish to paginate and that the query includes the `nodes` field."
    )
  }

  if (
    !_.has(data, pageInfoPath) ||
    !_.has(data, endCursorPath) ||
    !_.has(data, hasNextPagePath)
  ) {
    throw new Error(
      "Data doesn't contain `pageInfo` field with `endCursor` and `hasNextPage` fields. Make sure the `paginatePath` is set to the field you wish to paginate and that the query includes the `pageInfo` field."
    )
  }

  while (hasNextPage(data)) {
    const newData = await queryFunction(query, {
      ...variables,
      after: _.get(data, [...pageInfoPath, 'endCursor']),
    })
    const newNodes = _.get(newData, nodesPath)
    const newPageInfo = _.get(newData, pageInfoPath)

    _.set(data, pageInfoPath, newPageInfo)
    _.update(data, nodesPath, (d) => [...d, ...newNodes])
  }

  return data
}

exports.paginate = paginate


/***/ }),

/***/ 373:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

const compareVersions = __nccwpck_require__(931)
const regexEscape = __nccwpck_require__(299)
const axios = __nccwpck_require__(162)

const { getVersionInfo } = __nccwpck_require__(687)
const { template } = __nccwpck_require__(97)
const { log } = __nccwpck_require__(313)

const sortReleases = (releases) => {
  // For semver, we find the greatest release number
  // For non-semver, we use the most recently merged
  try {
    return releases.sort((r1, r2) => compareVersions(r1.tag_name, r2.tag_name))
  } catch {
    return releases.sort(
      (r1, r2) => new Date(r1.created_at) - new Date(r2.created_at)
    )
  }
}

const findReleases = async ({ ref, context, config }) => {
  let releases = await context.octokit.paginate(
    context.octokit.repos.listReleases.endpoint.merge(
      context.repo({
        per_page: 100,
      })
    )
  )

  log({ context, message: `Found ${releases.length} releases` })

  const { 'filter-by-commitish': filterByCommitish } = config
  const filteredReleases = filterByCommitish
    ? releases.filter((r) => ref.match(`/${r.target_commitish}$`))
    : releases
  const sortedPublishedReleases = sortReleases(
    filteredReleases.filter((r) => !r.draft)
  )
  const draftRelease = filteredReleases.find((r) => r.draft)
  const lastRelease =
    sortedPublishedReleases[sortedPublishedReleases.length - 1]

  if (draftRelease) {
    log({ context, message: `Draft release: ${draftRelease.tag_name}` })
  } else {
    log({ context, message: `No draft release found` })
  }

  if (lastRelease) {
    log({ context, message: `Last release: ${lastRelease.tag_name}` })
  } else {
    log({ context, message: `No last release found` })
  }

  return { draftRelease, lastRelease }
}

const contributorsSentence = ({ commits, pullRequests, config }) => {
  const { 'exclude-contributors': excludeContributors } = config

  const contributors = new Set()

  for (const commit of commits) {
    if (commit.author.user) {
      if (!excludeContributors.includes(commit.author.user.login)) {
        contributors.add(`@${commit.author.user.login}`)
      }
    } else {
      contributors.add(commit.author.name)
    }
  }

  for (const pullRequest of pullRequests) {
    if (
      pullRequest.author &&
      !excludeContributors.includes(pullRequest.author.login)
    ) {
      contributors.add(`@${pullRequest.author.login}`)
    }
  }

  const sortedContributors = [...contributors].sort()
  if (sortedContributors.length > 1) {
    return (
      sortedContributors.slice(0, -1).join(', ') +
      ' and ' +
      sortedContributors.slice(-1)
    )
  } else if (sortedContributors.length === 1) {
    return sortedContributors[0]
  } else {
    return config['no-contributors-template']
  }
}

const getFilterExcludedPullRequests = (excludeLabels) => {
  return (pullRequest) => {
    const labels = pullRequest.labels.nodes
    if (labels.some((label) => excludeLabels.includes(label.name))) {
      return false
    }
    return true
  }
}

const getFilterIncludedPullRequests = (includeLabels) => {
  return (pullRequest) => {
    const labels = pullRequest.labels.nodes
    if (
      includeLabels.length === 0 ||
      labels.some((label) => includeLabels.includes(label.name))
    ) {
      return true
    }
    return false
  }
}

const categorizePullRequests = (pullRequests, config) => {
  const {
    'exclude-labels': excludeLabels,
    'include-labels': includeLabels,
    categories,
  } = config
  const allCategoryLabels = new Set(
    categories.flatMap((category) => category.labels)
  )
  const uncategorizedPullRequests = []
  const categorizedPullRequests = [...categories].map((category) => {
    return { ...category, pullRequests: [] }
  })

  const filterUncategorizedPullRequests = (pullRequest) => {
    const labels = pullRequest.labels.nodes

    if (
      labels.length === 0 ||
      !labels.some((label) => allCategoryLabels.has(label.name))
    ) {
      uncategorizedPullRequests.push(pullRequest)
      return false
    }
    return true
  }

  // we only want pull requests that have yet to be categorized
  const filteredPullRequests = pullRequests
    .filter(getFilterExcludedPullRequests(excludeLabels))
    .filter(getFilterIncludedPullRequests(includeLabels))
    .filter((pullRequest) => filterUncategorizedPullRequests(pullRequest))

  categorizedPullRequests.map((category) => {
    filteredPullRequests.map((pullRequest) => {
      // lets categorize some pull request based on labels
      // note that having the same label in multiple categories
      // then it is intended to "duplicate" the pull request into each category
      const labels = pullRequest.labels.nodes
      if (labels.some((label) => category.labels.includes(label.name))) {
        category.pullRequests.push(pullRequest)
      }
    })
  })

  return [uncategorizedPullRequests, categorizedPullRequests]
}

const generateChangeLog = (mergedPullRequests, config) => {
  if (mergedPullRequests.length === 0) {
    return config['no-changes-template']
  }

  const [uncategorizedPullRequests, categorizedPullRequests] =
    categorizePullRequests(mergedPullRequests, config)

  const escapeTitle = (title) =>
    // If config['change-title-escapes'] contains backticks, then they will be escaped along with content contained inside backticks
    // If not, the entire backtick block is matched so that it will become a markdown code block without escaping any of its content
    title.replace(
      new RegExp(
        `[${regexEscape(config['change-title-escapes'])}]|\`.*?\``,
        'g'
      ),
      (match) => {
        if (match.length > 1) return match
        if (match == '@' || match == '#') return `${match}<!---->`
        return `\\${match}`
      }
    )

  const filterBody = (body) => {
    const filter = config['body-regex-filter']
    if (filter.length > 0) {
      const regex = new RegExp(filter)
      return (body.match(regex) && body.match(regex)[0]) || ''
    }
    return body
  }

  const pullRequestToString = (pullRequests) =>
    pullRequests
      .map((pullRequest) =>
        template(config['change-template'], {
          $TITLE: escapeTitle(pullRequest.title),
          $NUMBER: pullRequest.number,
          $AUTHOR: pullRequest.author ? pullRequest.author.login : 'ghost',
          $BODY: filterBody(pullRequest.body),
          $URL: pullRequest.url,
          $BASE_REF_NAME: pullRequest.baseRefName,
          $HEAD_REF_NAME: pullRequest.headRefName,
        })
      )
      .join('\n')

  const changeLog = []

  if (uncategorizedPullRequests.length > 0) {
    changeLog.push(pullRequestToString(uncategorizedPullRequests), '\n\n')
  }

  categorizedPullRequests.map((category, index) => {
    if (category.pullRequests.length > 0) {
      changeLog.push(
        template(config['category-template'], { $TITLE: category.title }),
        '\n\n',
        pullRequestToString(category.pullRequests)
      )

      if (index + 1 !== categorizedPullRequests.length) changeLog.push('\n\n')
    }
  })

  return changeLog.join('').trim()
}

const resolveVersionKeyIncrement = (mergedPullRequests, config) => {
  const priorityMap = {
    patch: 1,
    minor: 2,
    major: 3,
  }
  const labelToKeyMap = Object.fromEntries(
    Object.keys(priorityMap)
      .flatMap((key) => [
        config['version-resolver'][key].labels.map((label) => [label, key]),
      ])
      .flat()
  )
  const keys = mergedPullRequests
    .filter(getFilterExcludedPullRequests(config['exclude-labels']))
    .filter(getFilterIncludedPullRequests(config['include-labels']))
    .flatMap((pr) => pr.labels.nodes.map((node) => labelToKeyMap[node.name]))
    .filter(Boolean)
  const keyPriorities = keys.map((key) => priorityMap[key])
  const priority = Math.max(...keyPriorities)
  const versionKey = Object.keys(priorityMap).find(
    (key) => priorityMap[key] === priority
  )
  return versionKey || config['version-resolver'].default
}


async function getCurrentDeploys() {
  const mySites = ["bilka", "foetex", "next-br", "wupti"]
  const response = await axios.get("https://api.netlify.com/api/v1/sites?filter=all", { headers: {
    'Authorization' : 'Bearer ' + 'mKxwmiTKwg4QUZYSzrFVpvb5cAJDk0O_hrcCARHAO8k'
  }})
  
  const site = {}
  const result = mySites.map(siteName => {
    const netlifySite = response.data.find(nSite => nSite.name === siteName)

    if (!netlifySite) return
    site[netlifySite.name] = `https://app.netlify.com/sites/${netlifySite.name}/${netlifySite.deploy_id}`
    return {
      site: siteName,
      deployUrl: `https://app.netlify.com/sites/${netlifySite.name}/${netlifySite.deploy_id}`
    }
  })

  return result
}

// function generateDeployUrls(data) {
//   // maybe better
//   const site = {}
//   const result = mySites.map(siteName => {
//     const netlifySite = data.find(nSite => nSite.name === siteName)

//     if (!netlifySite) return
//     site[netlifySite.name] = `https://app.netlify.com/sites/${netlifySite.name}/${netlifySite.deploy_id}`
//     return {
//       site: siteName,
//       deployUrl: `https://app.netlify.com/sites/${netlifySite.name}/${netlifySite.deploy_id}`
//     }
//   })

//   return result
// }

const generateReleaseInfo = async ({
  commits,
  config,
  lastRelease,
  mergedPullRequests,
  version,
  tag,
  name,
  isPreRelease,
  shouldDraft,
  commitish,
}) => {
  let body = config.template

  body = template(
    body,
    {
      $PREVIOUS_TAG: lastRelease ? lastRelease.tag_name : '',
      $CHANGES: generateChangeLog(mergedPullRequests, config),
      $CONTRIBUTORS: contributorsSentence({
        commits,
        pullRequests: mergedPullRequests,
        config,
      }),
    },
    config.replacers
  )

  const versionInfo = getVersionInfo(
    lastRelease,
    config['version-template'],
    // Use the first override parameter to identify
    // a version, from the most accurate to the least
    version || tag || name,
    resolveVersionKeyIncrement(mergedPullRequests, config)
  )

  if (versionInfo) {
    body = template(body, versionInfo)
  }

  if (tag === undefined) {
    tag = versionInfo ? template(config['tag-template'] || '', versionInfo) : ''
  }

  if (name === undefined) {
    name = versionInfo
      ? template(config['name-template'] || '', versionInfo)
      : ''
  }

  if (commitish === undefined) {
    commitish = config['commitish'] || ''
  }

  return {
    name,
    tag,
    body: `${body} \n TEST \n `,
    commitish,
    prerelease: isPreRelease,
    draft: shouldDraft,
  }
}

const createRelease = ({ context, releaseInfo }) => {
  return context.octokit.repos.createRelease(
    context.repo({
      target_commitish: releaseInfo.commitish,
      name: releaseInfo.name,
      tag_name: releaseInfo.tag,
      body: releaseInfo.body,
      draft: releaseInfo.draft,
      prerelease: releaseInfo.prerelease,
    })
  )
}

const updateRelease = ({ context, draftRelease, releaseInfo }) => {
  const updateReleaseParameters = updateDraftReleaseParameters({
    name: releaseInfo.name || draftRelease.name,
    tag_name: releaseInfo.tag || draftRelease.tag_name,
  })

  return context.octokit.repos.updateRelease(
    context.repo({
      release_id: draftRelease.id,
      body: releaseInfo.body,
      draft: releaseInfo.draft,
      prerelease: releaseInfo.prerelease,
      ...updateReleaseParameters,
    })
  )
}

function updateDraftReleaseParameters(parameters) {
  const updateReleaseParameters = { ...parameters }

  // Let GitHub figure out `name` and `tag_name` if undefined
  if (!updateReleaseParameters.name) {
    delete updateReleaseParameters.name
  }
  if (!updateReleaseParameters.tag_name) {
    delete updateReleaseParameters.tag_name
  }

  return updateReleaseParameters
}

exports.findReleases = findReleases
exports.generateChangeLog = generateChangeLog
exports.generateReleaseInfo = generateReleaseInfo
exports.createRelease = createRelease
exports.updateRelease = updateRelease


/***/ }),

/***/ 240:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

const _ = __nccwpck_require__(348)
const Joi = __nccwpck_require__(189)
const { SORT_BY, SORT_DIRECTIONS } = __nccwpck_require__(697)
const { DEFAULT_CONFIG } = __nccwpck_require__(504)
const { validateReplacers, validateAutolabeler } = __nccwpck_require__(97)

const schema = (context) => {
  const defaultBranch = _.get(
    context,
    'payload.repository.default_branch',
    'master'
  )
  return Joi.object()
    .keys({
      references: Joi.array().items(Joi.string()).default([defaultBranch]),

      'change-template': Joi.string().default(
        DEFAULT_CONFIG['change-template']
      ),

      'change-title-escapes': Joi.string()
        .allow('')
        .default(DEFAULT_CONFIG['change-title-escapes']),

      'body-regex-filter': Joi.string()
        .allow('')
        .default(DEFAULT_CONFIG['body-regex-filter']),

      'no-changes-template': Joi.string().default(
        DEFAULT_CONFIG['no-changes-template']
      ),

      'version-template': Joi.string().default(
        DEFAULT_CONFIG['version-template']
      ),

      'name-template': Joi.string()
        .allow('')
        .default(DEFAULT_CONFIG['name-template']),

      'tag-template': Joi.string()
        .allow('')
        .default(DEFAULT_CONFIG['tag-template']),

      'exclude-labels': Joi.array()
        .items(Joi.string())
        .default(DEFAULT_CONFIG['exclude-labels']),

      'include-labels': Joi.array()
        .items(Joi.string())
        .default(DEFAULT_CONFIG['include-labels']),

      'exclude-contributors': Joi.array()
        .items(Joi.string())
        .default(DEFAULT_CONFIG['exclude-contributors']),

      'no-contributors-template': Joi.string().default(
        DEFAULT_CONFIG['no-contributors-template']
      ),

      'sort-by': Joi.string()
        .valid(SORT_BY.mergedAt, SORT_BY.title)
        .default(DEFAULT_CONFIG['sort-by']),

      'sort-direction': Joi.string()
        .valid(SORT_DIRECTIONS.ascending, SORT_DIRECTIONS.descending)
        .default(DEFAULT_CONFIG['sort-direction']),

      prerelease: Joi.boolean().default(DEFAULT_CONFIG.prerelease),

      'filter-by-commitish': Joi.boolean().default(
        DEFAULT_CONFIG['filter-by-commitish']
      ),

      commitish: Joi.string().allow('').default(DEFAULT_CONFIG['commitish']),

      replacers: Joi.array()
        .items(
          Joi.object().keys({
            search: Joi.string()
              .required()
              .error(
                () => '"search" is required and must be a regexp or a string'
              ),
            replace: Joi.string().allow('').required(),
          })
        )
        .default(DEFAULT_CONFIG.replacers),

      autolabeler: Joi.array()
        .items(
          Joi.object().keys({
            label: Joi.string().required(),
            files: Joi.array().items(Joi.string()).single().default([]),
            branch: Joi.array().items(Joi.string()).single().default([]),
            title: Joi.array().items(Joi.string()).single().default([]),
            body: Joi.array().items(Joi.string()).single().default([]),
          })
        )
        .default(DEFAULT_CONFIG.autolabeler),

      categories: Joi.array()
        .items(
          Joi.object()
            .keys({
              title: Joi.string().required(),
              label: Joi.string(),
              labels: Joi.array().items(Joi.string()).single().default([]),
            })
            .rename('label', 'labels', {
              ignoreUndefined: true,
              override: true,
            })
        )
        .default(DEFAULT_CONFIG.categories),

      'version-resolver': Joi.object()
        .keys({
          major: Joi.object({
            labels: Joi.array().items(Joi.string()).single(),
          }),
          minor: Joi.object({
            labels: Joi.array().items(Joi.string()).single(),
          }),
          patch: Joi.object({
            labels: Joi.array().items(Joi.string()).single(),
          }),
          default: Joi.string()
            .valid('major', 'minor', 'patch')
            .default('patch'),
        })
        .default(DEFAULT_CONFIG['version-resolver']),

      'category-template': Joi.string()
        .allow('')
        .default(DEFAULT_CONFIG['category-template']),

      template: Joi.string().required(),

      _extends: Joi.string(),
    })
    .rename('branches', 'references', {
      ignoreUndefined: true,
      override: true,
    })
}

const validateSchema = (context, repoConfig) => {
  const { error, value: config } = schema(context).validate(repoConfig, {
    abortEarly: false,
    allowUnknown: true,
  })

  if (error) throw error

  try {
    config.replacers = validateReplacers({
      context,
      replacers: config.replacers,
    })
  } catch {
    config.replacers = []
  }

  try {
    config.autolabeler = validateAutolabeler({
      context,
      autolabeler: config.autolabeler,
    })
  } catch {
    config.autolabeler = []
  }

  return config
}

exports.schema = schema
exports.validateSchema = validateSchema


/***/ }),

/***/ 697:
/***/ ((__unused_webpack_module, exports) => {

const SORT_BY = {
  mergedAt: 'merged_at',
  title: 'title',
}

const SORT_DIRECTIONS = {
  ascending: 'ascending',
  descending: 'descending',
}

const sortPullRequests = (pullRequests, sortBy, sortDirection) => {
  const getSortField = sortBy === SORT_BY.title ? getTitle : getMergedAt

  const sort =
    sortDirection === SORT_DIRECTIONS.ascending
      ? dateSortAscending
      : dateSortDescending

  return [...pullRequests].sort((a, b) =>
    sort(getSortField(a), getSortField(b))
  )
}

function getMergedAt(pullRequest) {
  return new Date(pullRequest.mergedAt)
}

function getTitle(pullRequest) {
  return pullRequest.title
}

function dateSortAscending(date1, date2) {
  if (date1 > date2) return 1
  if (date1 < date2) return -1
  return 0
}

function dateSortDescending(date1, date2) {
  if (date1 > date2) return -1
  if (date1 < date2) return 1
  return 0
}

exports.SORT_BY = SORT_BY
exports.SORT_DIRECTIONS = SORT_DIRECTIONS
exports.sortPullRequests = sortPullRequests


/***/ }),

/***/ 97:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

const { log } = __nccwpck_require__(313)
const regexParser = __nccwpck_require__(621)
const regexEscape = __nccwpck_require__(299)

/**
 * replaces all uppercase dollar templates with their string representation from object
 * if replacement is undefined in object the dollar template string is left untouched
 */

const template = (string, object, customReplacers) => {
  let input = string.replace(/(\$[A-Z_]+)/g, (_, k) => {
    let result
    if (object[k] === undefined || object[k] === null) {
      result = k
    } else if (typeof object[k] === 'object') {
      result = template(object[k].template, object[k])
    } else {
      result = `${object[k]}`
    }
    return result
  })
  if (customReplacers) {
    for (const { search, replace } of customReplacers) {
      input = input.replace(search, replace)
    }
  }
  return input
}

function toRegex(search) {
  return /^\/.+\/[AJUXgimsux]*$/.test(search)
    ? regexParser(search)
    : new RegExp(regexEscape(search), 'g')
}

function validateReplacers({ context, replacers }) {
  return replacers
    .map((replacer) => {
      try {
        return { ...replacer, search: toRegex(replacer.search) }
      } catch {
        log({
          context,
          message: `Bad replacer regex: '${replacer.search}'`,
        })
        return false
      }
    })
    .filter(Boolean)
}

function validateAutolabeler({ context, autolabeler }) {
  return autolabeler
    .map((autolabel) => {
      try {
        return {
          ...autolabel,
          branch: autolabel.branch.map((reg) => {
            return toRegex(reg)
          }),
          title: autolabel.title.map((reg) => {
            return toRegex(reg)
          }),
          body: autolabel.body.map((reg) => {
            return toRegex(reg)
          }),
        }
      } catch {
        log({
          context,
          message: `Bad autolabeler regex: '${autolabel.branch}', '${autolabel.title}' or '${autolabel.body}'`,
        })
        return false
      }
    })
    .filter(Boolean)
}

exports.template = template
exports.validateReplacers = validateReplacers
exports.validateAutolabeler = validateAutolabeler


/***/ }),

/***/ 829:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

const { log } = __nccwpck_require__(313)

const isTriggerableReference = ({ context, ref, config }) => {
  const { GITHUB_ACTIONS } = process.env
  if (GITHUB_ACTIONS) {
    // Let GitHub Action determine when to run the action based on the workflow's on syntax
    // See https://help.github.com/en/actions/reference/workflow-syntax-for-github-actions#on
    return true
  }
  const referenceRegex = /^refs\/(?:heads|tags)\//
  const refernces = config.references.map((r) => r.replace(referenceRegex, ''))
  const shortReference = ref.replace(referenceRegex, '')
  const validReference = new RegExp(refernces.join('|'))
  const relevant = validReference.test(shortReference)
  if (!relevant) {
    log({
      context,
      message: `Ignoring push. ${shortReference} does not match: ${refernces.join(
        ', '
      )}`,
    })
  }
  return relevant
}

exports.isTriggerableReference = isTriggerableReference


/***/ }),

/***/ 282:
/***/ ((__unused_webpack_module, exports) => {

function runnerIsActions() {
  return process.env['GITHUB_ACTIONS'] !== undefined
}

exports.runnerIsActions = runnerIsActions


/***/ }),

/***/ 687:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

const semver = __nccwpck_require__(761)

const splitSemVersion = (input, versionKey = 'version') => {
  if (!input[versionKey]) {
    return
  }

  const version = input.inc
    ? semver.inc(input[versionKey], input.inc, true)
    : input[versionKey].version

  return {
    ...input,
    version,
    $MAJOR: semver.major(version),
    $MINOR: semver.minor(version),
    $PATCH: semver.patch(version),
    $COMPLETE: version,
  }
}

const getTemplatableVersion = (input) => {
  const templatableVersion = {
    $NEXT_MAJOR_VERSION: splitSemVersion({ ...input, inc: 'major' }),
    $NEXT_MAJOR_VERSION_MAJOR: splitSemVersion({
      ...input,
      inc: 'major',
      template: '$MAJOR',
    }),
    $NEXT_MAJOR_VERSION_MINOR: splitSemVersion({
      ...input,
      inc: 'major',
      template: '$MINOR',
    }),
    $NEXT_MAJOR_VERSION_PATCH: splitSemVersion({
      ...input,
      inc: 'major',
      template: '$PATCH',
    }),
    $NEXT_MINOR_VERSION: splitSemVersion({ ...input, inc: 'minor' }),
    $NEXT_MINOR_VERSION_MAJOR: splitSemVersion({
      ...input,
      inc: 'minor',
      template: '$MAJOR',
    }),
    $NEXT_MINOR_VERSION_MINOR: splitSemVersion({
      ...input,
      inc: 'minor',
      template: '$MINOR',
    }),
    $NEXT_MINOR_VERSION_PATCH: splitSemVersion({
      ...input,
      inc: 'minor',
      template: '$PATCH',
    }),
    $NEXT_PATCH_VERSION: splitSemVersion({ ...input, inc: 'patch' }),
    $NEXT_PATCH_VERSION_MAJOR: splitSemVersion({
      ...input,
      inc: 'patch',
      template: '$MAJOR',
    }),
    $NEXT_PATCH_VERSION_MINOR: splitSemVersion({
      ...input,
      inc: 'patch',
      template: '$MINOR',
    }),
    $NEXT_PATCH_VERSION_PATCH: splitSemVersion({
      ...input,
      inc: 'patch',
      template: '$PATCH',
    }),
    $INPUT_VERSION: splitSemVersion(input, 'inputVersion'),
    $RESOLVED_VERSION: splitSemVersion({
      ...input,
      inc: input.versionKeyIncrement || 'patch',
    }),
  }

  templatableVersion.$RESOLVED_VERSION =
    templatableVersion.$INPUT_VERSION || templatableVersion.$RESOLVED_VERSION

  return templatableVersion
}

const toSemver = (version) => {
  const result = semver.parse(version)
  if (result) {
    return result
  }

  // doesn't handle prerelease
  return semver.coerce(version)
}

const coerceVersion = (input) => {
  if (!input) {
    return
  }

  return typeof input === 'object'
    ? toSemver(input.tag_name) || toSemver(input.name)
    : toSemver(input)
}

const getVersionInfo = (
  release,
  template,
  inputVersion,
  versionKeyIncrement
) => {
  const version = coerceVersion(release)
  inputVersion = coerceVersion(inputVersion)

  if (!version && !inputVersion) {
    return
  }

  return {
    ...getTemplatableVersion({
      version,
      template,
      inputVersion,
      versionKeyIncrement,
    }),
  }
}

exports.getVersionInfo = getVersionInfo


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
const core = __nccwpck_require__(941)
const { run } = __nccwpck_require__(946)
const releaseDrafter = __nccwpck_require__(955)

run(releaseDrafter).catch((error) => {
  core.setFailed(`💥 Release drafter failed with error: ${error.message}`)
})

})();

module.exports = __webpack_exports__;
/******/ })()
;