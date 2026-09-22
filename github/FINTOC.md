# Fintoc OpenCode fork

This fork lets configured bots trigger reviews through `pull_request`, `issue_comment`, and `pull_request_review_comment` while preserving upstream's collaborator checks for other callers. The model, prompt, PR context, reactions, and review execution remain in upstream OpenCode.

## Authorization

Set `allowed_bots` to a comma-separated list of exact bot logins in the trusted workflow. The default is empty. The CLI accepts the exception only when GitHub's event identifies the sender as a Bot, the sender matches the triggering actor, and that login is in the list. The PR author and comment text cannot grant this exception. Human users continue to need `write` or `admin` collaborator permission, even if their login is listed. Other event types retain upstream behavior.

The CLI reads `ALLOWED_BOTS`; the action passes its `allowed_bots` input. Both token modes use the same authorization rule. Use full GitHub logins, including `[bot]`; wildcards and partial matches are not supported. Configure the list centrally in Hermes; caller repos and agents keep their existing PR and `fin review` flows.

## Build and release

`github/fintoc.json` records the upstream base and the patched CLI version. Increment the `-fintoc.N` suffix for a new patch on the same upstream release. Do not replace existing release assets.

Run the **Fintoc CLI** workflow on the fork's default branch with `publish` enabled. It runs the GitHub tests and package typecheck, builds and smoke-tests the Linux X64 binary, and publishes a versioned prerelease with its checksum. The build omits the embedded web UI because this distribution is for the GitHub runner. Publishing from other branches is disabled.

The fork action requires `release_repository` and installs exactly the version in its own `github/fintoc.json`. It never installs upstream latest. It checks the archive checksum and the executable's version, and separates its cache from upstream's. This installer supports Linux X64 runners.

Example consumer configuration (replace the action commit):

```yaml
- uses: fintoc-com/opencode/github@FULL_COMMIT_SHA
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  with:
    release_repository: fintoc-com/opencode
    allowed_bots: "fin-tank-agent[bot],linear-code[bot]"
    use_github_token: true
    model: openai/gpt-5.4
    share: false
    prompt: ${{ steps.review-pr-prompt.outputs.prompt }}
```

Publish the matching release before updating consumers. Public forks work with the consumer's built-in GitHub token; access to a private release repository would require a separate installation credential and is not implemented here.

For a local build on the current platform:

```bash
bun install --frozen-lockfile
cd packages/opencode
bun test test/cli/fintoc-install.test.ts test/cli/github-permissions.test.ts test/cli/github-action.test.ts test/cli/github-remote.test.ts
bun typecheck
OPENCODE_VERSION=1.18.31-fintoc.1 bun run build --single --skip-install --skip-embed-web-ui
```

## Upstream updates

Use a fork default branch based on the release in `github/fintoc.json`, with these changes committed on top. Enable **Update Fintoc OpenCode** and **Fintoc CLI** in the fork; upstream infrastructure workflows are not part of this fork's release process. The repository must permit Actions to create pull requests for the scheduled updater.

Each Monday, or on manual dispatch, the updater checks the latest stable upstream release. It creates an update branch from the fork's default branch and merges the upstream release tag into it, preserving the fork's commits. A conflict stops the update and leaves the default branch and existing consumers unchanged.

Before opening an update PR, the updater runs the authorization and GitHub tests, package typecheck, Linux build, and version smoke test. These checks run inside the updater because its `GITHUB_TOKEN`-created PR does not trigger another workflow. The updater never merges or publishes automatically.

After reviewing and merging an update, publish the new binary through **Fintoc CLI**, then update consumers to the new action commit. Features in the new upstream release are included; any conflicting fork changes need manual resolution. If upstream adds compatible App authorization, remove this patch and return consumers to the official action.
