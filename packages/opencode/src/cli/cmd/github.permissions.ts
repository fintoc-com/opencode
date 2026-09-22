import type { Context } from "@actions/github/lib/context"
import type { Octokit } from "@octokit/rest"

export async function assertPermissions(
  context: Pick<Context, "actor" | "eventName" | "repo" | "payload">,
  octokit: Octokit,
  allowedBots = "",
) {
  const { actor } = context
  console.log(`Asserting permissions for user ${actor}...`)

  const sender = context.payload.sender
  if (
    ["issue_comment", "pull_request", "pull_request_review_comment"].includes(context.eventName) &&
    sender?.type === "Bot" &&
    sender.login === actor &&
    allowedBots.split(",").some((login) => login.trim() === actor)
  ) {
    console.log(`  allowed bot: ${actor}`)
    return
  }

  let permission
  try {
    const response = await octokit.repos.getCollaboratorPermissionLevel({
      ...context.repo,
      username: actor,
    })

    permission = response.data.permission
    console.log(`  permission: ${permission}`)
  } catch (error) {
    console.error(`Failed to check permissions: ${String(error)}`)
    throw new Error(`Failed to check permissions for user ${actor}: ${String(error)}`, { cause: error })
  }

  if (!["admin", "write"].includes(permission)) throw new Error(`User ${actor} does not have write permissions`)
}
