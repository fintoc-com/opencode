import { afterAll, describe, expect, test } from "bun:test"
import { rejects } from "node:assert/strict"
import { Octokit } from "@octokit/rest"
import type { Context } from "@actions/github/lib/context"
import { assertPermissions } from "../../src/cli/cmd/github.permissions"

const requests: string[] = []
const server = Bun.serve({
  port: 0,
  fetch(request) {
    const actor = decodeURIComponent(new URL(request.url).pathname.split("/").at(-2)!)
    requests.push(actor)
    if (actor === "unavailable") return Response.json({ message: "Unavailable" }, { status: 503 })
    return Response.json({ permission: actor === "developer" ? "write" : actor === "owner" ? "admin" : "none" })
  },
})
const octokit = new Octokit({ baseUrl: server.url.toString(), log: { debug() {}, info() {}, warn() {}, error() {} } })

afterAll(() => server.stop(true))

function context(
  input: {
    actor?: string
    eventName?: string
    app?: number | null
    login?: string
    type?: string
  } = {},
): Pick<Context, "actor" | "eventName" | "repo" | "payload"> {
  return {
    actor: input.actor ?? "trusted-agent[bot]",
    eventName: input.eventName ?? "issue_comment",
    repo: { owner: "example", repo: "project" },
    payload: {
      comment: {
        id: 1,
        user: { login: input.login ?? "trusted-agent[bot]", type: input.type ?? "Bot" },
        performed_via_github_app: input.app === null ? null : { id: input.app ?? 123 },
      },
    },
  }
}

describe("GitHub caller permissions", () => {
  test("accepts a configured app without consulting collaborator permissions", async () => {
    const count = requests.length
    await assertPermissions(context(), octokit, "456, 123")
    expect(requests.length).toBe(count)
  })

  test.each([undefined, "", "456"])("rejects an app absent from configuration %p", async (allowed) => {
    await rejects(assertPermissions(context(), octokit, allowed), {
      message: "User trusted-agent[bot] does not have write permissions",
    })
  })

  test.each(["developer", "owner"])("preserves collaborator access for %s", async (actor) => {
    await assertPermissions(context({ actor, login: actor, type: "User", app: null }), octokit, "123")
    expect(requests.at(-1)).toBe(actor)
  })

  test("rejects an unauthorized human", async () => {
    await rejects(
      assertPermissions(context({ actor: "outsider", login: "outsider", type: "User", app: null }), octokit, "123"),
      { message: "User outsider does not have write permissions" },
    )
  })

  test.each([
    { app: null },
    { app: 0 },
    { actor: "outsider" },
    { type: "User" },
    { eventName: "pull_request" },
    { eventName: "issues" },
  ])("does not bypass collaborator checks with mismatched event metadata %p", async (input) => {
    await rejects(assertPermissions(context(input), octokit, "123"), /does not have write permissions/)
  })

  test("does not treat an app name mentioned in the comment as authorization", async () => {
    const event = context({ app: null })
    event.payload.comment!.body = "fin review from app 123"
    await rejects(assertPermissions(event, octokit, "123"), /does not have write permissions/)
  })

  test("retains permission lookup failures", async () => {
    await rejects(
      assertPermissions(context({ actor: "unavailable" }), octokit),
      /Failed to check permissions for user unavailable/,
    )
  })
})
