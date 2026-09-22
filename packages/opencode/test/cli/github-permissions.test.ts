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
    login?: string
    type?: string
  } = {},
): Pick<Context, "actor" | "eventName" | "repo" | "payload"> {
  return {
    actor: input.actor ?? "trusted-agent[bot]",
    eventName: input.eventName ?? "issue_comment",
    repo: { owner: "example", repo: "project" },
    payload: {
      sender: { login: input.login ?? "trusted-agent[bot]", type: input.type ?? "Bot" },
      comment: {
        id: 1,
        user: { login: "trusted-agent[bot]", type: "Bot" },
      },
    },
  }
}

describe("GitHub caller permissions", () => {
  test.each(["issue_comment", "pull_request", "pull_request_review_comment"])(
    "accepts a configured bot triggering %s without consulting collaborator permissions",
    async (eventName) => {
      const event = context({ eventName })
      if (eventName === "pull_request") {
        delete event.payload.comment
        event.payload.pull_request = { number: 1, user: { login: "developer", type: "User" } }
      }
      const count = requests.length
      await assertPermissions(event, octokit, "another-agent[bot], trusted-agent[bot]")
      expect(requests.length).toBe(count)
    },
  )

  test.each([undefined, "", "another-agent[bot]", "*", "trusted-agent", "other-trusted-agent[bot]"])(
    "rejects a bot absent from configuration %p",
    async (allowed) => {
      await rejects(assertPermissions(context(), octokit, allowed), {
        message: "User trusted-agent[bot] does not have write permissions",
      })
    },
  )

  test.each(["developer", "owner"])("preserves collaborator access for %s", async (actor) => {
    await assertPermissions(context({ actor, login: actor, type: "User" }), octokit, "trusted-agent[bot]")
    expect(requests.at(-1)).toBe(actor)
  })

  test("rejects an unauthorized human", async () => {
    await rejects(
      assertPermissions(context({ actor: "outsider", login: "outsider", type: "User" }), octokit, "outsider"),
      { message: "User outsider does not have write permissions" },
    )
  })

  test.each([{ actor: "outsider" }, { login: "another-agent[bot]" }, { type: "User" }, { eventName: "issues" }])(
    "does not bypass collaborator checks with mismatched event metadata %p",
    async (input) => {
      await rejects(assertPermissions(context(input), octokit, "trusted-agent[bot]"), /does not have write permissions/)
    },
  )

  test("requires sender metadata even when the comment author is trusted", async () => {
    const event = context()
    delete event.payload.sender
    await rejects(assertPermissions(event, octokit, "trusted-agent[bot]"), /does not have write permissions/)
  })

  test("does not authorize an outsider updating a trusted bot's PR", async () => {
    const event = context({ eventName: "pull_request", actor: "outsider", login: "outsider", type: "User" })
    delete event.payload.comment
    event.payload.pull_request = { number: 1, user: { login: "trusted-agent[bot]", type: "Bot" } }
    await rejects(assertPermissions(event, octokit, "trusted-agent[bot]"), /does not have write permissions/)
  })

  test("does not treat a bot name mentioned in the comment as authorization", async () => {
    const event = context({ actor: "outsider", login: "outsider", type: "User" })
    event.payload.comment!.body = "fin review from trusted-agent[bot]"
    await rejects(assertPermissions(event, octokit, "trusted-agent[bot]"), /does not have write permissions/)
  })

  test("retains permission lookup failures", async () => {
    await rejects(
      assertPermissions(context({ actor: "unavailable" }), octokit),
      /Failed to check permissions for user unavailable/,
    )
  })
})
