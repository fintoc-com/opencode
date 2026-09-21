import type { Context } from "@actions/github/lib/context"
import type { Octokit } from "@octokit/rest"

export async function assertPermissions(
  context: Pick<Context, "actor" | "eventName" | "repo" | "payload">,
  octokit: Octokit,
  allowedAppIds = "",
) {
  const { actor } = context
  console.log(`Asserting permissions for user ${actor}...`)

  const comment = context.payload.comment
  const app = comment?.performed_via_github_app
  if (
    context.eventName === "issue_comment" &&
    comment?.user?.type === "Bot" &&
    comment.user.login === actor &&
    Number.isSafeInteger(app?.id) &&
    app.id > 0 &&
    allowedAppIds.split(",").some((id) => id.trim() === String(app.id))
  ) {
    console.log(`  allowed GitHub App: ${app.id}`)
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
