import { expect, test } from "bun:test"
import { $ } from "bun"
import { chmod, mkdir } from "node:fs/promises"
import { tmpdir } from "../fixture/fixture"

const script = new URL("../../../../github/install-fintoc.sh", import.meta.url).pathname

test.each([false, true])("installs only checksum-verified release archives (corrupted=%p)", async (corrupted) => {
  await using dir = await tmpdir()
  await mkdir(`${dir.path}/commands`)
  await Bun.write(`${dir.path}/opencode`, "#!/bin/sh\nprintf '1.18.31-fintoc.1\\n'\n")
  await $`tar -czf ${dir.path}/opencode-linux-x64.tar.gz -C ${dir.path} opencode`.quiet()
  await Bun.write(`${dir.path}/SHA256SUMS`, await $`sha256sum opencode-linux-x64.tar.gz`.cwd(dir.path).text())
  if (corrupted) await Bun.write(`${dir.path}/opencode-linux-x64.tar.gz`, "corrupted archive")
  await Bun.write(
    `${dir.path}/commands/gh`,
    `#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == release && "$2" == download && "$3" == v1.18.31-fintoc.1 && "$4" == --repo && "$5" == example/opencode ]]
for arg in "$@"; do destination="$arg"; done
cp "$FIXTURE_RELEASE_DIR/opencode-linux-x64.tar.gz" "$FIXTURE_RELEASE_DIR/SHA256SUMS" "$destination"
`,
  )
  await chmod(`${dir.path}/commands/gh`, 0o755)
  const result = await $`bash ${script}`
    .env({
      ...process.env,
      PATH: `${dir.path}/commands:${process.env.PATH}`,
      RUNNER_OS: "Linux",
      RUNNER_ARCH: "X64",
      OPENCODE_RELEASE_REPOSITORY: "example/opencode",
      OPENCODE_RELEASE_VERSION: "1.18.31-fintoc.1",
      OPENCODE_INSTALL_DIR: `${dir.path}/installed`,
      FIXTURE_RELEASE_DIR: dir.path,
    })
    .quiet()
    .nothrow()

  if (corrupted) {
    expect(result.exitCode).not.toBe(0)
    expect(await Bun.file(`${dir.path}/installed/opencode`).exists()).toBe(false)
    return
  }
  expect(result.exitCode).toBe(0)
  expect((await $`${dir.path}/installed/opencode --version`.text()).trim()).toBe("1.18.31-fintoc.1")
})

test("rejects a floating release version before downloading", async () => {
  const result = await $`bash ${script}`
    .env({
      ...process.env,
      RUNNER_OS: "Linux",
      RUNNER_ARCH: "X64",
      OPENCODE_RELEASE_REPOSITORY: "example/opencode",
      OPENCODE_RELEASE_VERSION: "latest",
    })
    .quiet()
    .nothrow()
  expect(result.exitCode).not.toBe(0)
  expect(result.stderr.toString()).toContain("Expected an explicit Fintoc CLI version")
})
