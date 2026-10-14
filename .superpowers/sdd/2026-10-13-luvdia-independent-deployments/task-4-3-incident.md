# Task4.3 incident — unauthorized remote R2 upload

Status: execution contained; operational impact unresolved. This is a scope violation, not local validation evidence. No claim of unchanged production bytes, harmlessness, rollback, or restored versions is made.

At 2026-10-14 18:55:10–18:55:26 KST, implementation agent `/root/sul36_task4_3_implement` ran `pnpm.cmd exec vitest run scripts/upload-profile-backgrounds.test.ts` with pinned Node24.20.0 first in PATH, redirecting output to `.tmp/sul36-4-3-cli-red.log`. Unified exec session99620. The test statically imported the existing `scripts/upload-profile-backgrounds-to-r2.mjs` before isolating its top-level side effect. That existing module enumerated actual local profile files and synchronously spawned Wrangler remote uploads. The agent's import was the cause; no instruction authorized remote IO.

Each child command was equivalent to pinned `node.exe node_modules/wrangler/bin/wrangler.js r2 object put otw-schedule/<key> --file <local original file> --content-type image/webp --cache-control public,max-age=31536000,immutable --remote --force`, cwd this repository. No explicit config/site was passed by the old script. It used its hardcoded/default bucket and existing local Wrangler credential context. Individual OS child PIDs were not captured before termination and are unknown; they must not be invented.

## Exact observed affected keys

| Bucket | Object key | Local log outcome |
| --- | --- | --- |
| otw-schedule | members/bing_hayu/backgrounds/luvtab/original.webp | `Upload complete.` |
| otw-schedule | members/bing_hayu/backgrounds/wedding/original.webp | `Upload complete.` |
| otw-schedule | members/bing_hayu/backgrounds/default/original.webp | `Upload complete.` |
| otw-schedule | members/hane/backgrounds/casual/original.webp | `Upload complete.` |
| otw-schedule | members/hane/backgrounds/default/original.webp | `Upload complete.` |
| otw-schedule | members/kim_ate/backgrounds/casual/original.webp | `Upload complete.` |
| otw-schedule | members/kim_ate/backgrounds/default/original.webp | `Creating object` only; result unknown |

The synchronous old script had 76 planned object paths. Six are reported complete, one was attempted with unknown result, and 69 were never started by this run. `.tmp/sul36-4-3-incident-objects.json` preserves every exact local path, bucket/key, and classification, reconstructed from the unchanged local directory and the old sequential filename parser/order; the completed/attempted boundary comes from the actual output. `.tmp/sul36-4-3-incident-local-inputs.json` preserves the seven actual local input sizes/SHA256 values. These hashes do not establish prior or current production equality.

## Containment and evidence

- Upon observing the risk, agent sent Ctrl-C to exec session99620; tool returned exit1. No CLI test assertion result was reached. The output is an incident record, not a valid RED test.
- Immediately inspected live Win32_Process command lines for upload-profile-backgrounds, matching Wrangler r2 object put, and this Vitest selection. No matching process remained. A second local CIM check also returned count0. No unrelated Node/MCP/app process was stopped for this incident.
- `.tmp/sul36-4-3-cli-red.log`: creation18:55:10, last write18:55:26 KST,2417bytes. Preserve exact content.
- `.tmp/sul36-4-3-incident-wrangler-log-index.json` preserves exact seven local Wrangler log paths/timestamps/sizes from18:55:12.470–18:55:26.706 KST. Original logs remain in the existing local Wrangler log directory; no remote query was used.
- `.tmp/sul36-4-3-incident-processes.json` is empty because the post-stop query had no matches; the later explicit count0 is the authoritative tool observation.
- Root/controller was informed immediately of the violation, then of the six complete/one unknown objects and containment. User-facing commentary acknowledged and apologized for the mistake. Root informed the user.
- Added only a direct-entry guard around the existing top-level execution before any further test: module import no longer reaches directory validation/upload loops. No CLI or Wrangler check was rerun after the incident. This first edit is not claimed as verified.

Controller required CLI/Wrangler execution checks to pause until import and invalid-target regressions prove subprocess/IO interception cannot launch remote work. Further local code edits and injected validation are allowed. Remote readback, repair, delete, upload, credential/account operations remain unapproved and were not performed after containment. Original source/legacy/private inputs and unrelated files remain preserved.

Operational impact, old remote bytes, object-version changes, existing cache behavior, and the seventh object's result are unknown. Resolving them requires separately authorized operational investigation. Local PASS results cannot close or offset this incident.

## Subsequent authorized readback and safety remediation (2026-10-14)
Root/controller later received explicit user authorization for exactly seven current-object GET reads. Root performed them separately; the implementation agent performed no remote IO after containment. All seven returned200, total14,215,562bytes, each current SHA256/size matching its incident input. Last-Modified KST18:55:13/15/19/21/22/25/28. The seventh Creating-only object's current body matched and its modification time18:55:28 was after the18:55:26 stop record. These observations resolve only current size/hash/readability and modification time; prior bytes, prior version, actual upload version, CDN cache state and user impact remain unknown. GET did not provide R2 upload-version; ETag is not substituted for it. Root owns .tmp/sul36-incident-readback-20261014 and docs/reports/sul-36/operational-upload-incident.md; those files are excluded from this agent's staging.

The initial direct-entry guard was subsequently replaced by the complete selected target wrapper/runner: validate explicit site/config/bucket/local persistence/stable operation ID before dynamic runtime load; both entry guards; local remoteBindings:false; injected import/invalid-target tests forbid actual remote runtime/spawn. cli-safe-green3.log10PASS and consumers-final.log9CLI safety checks support that boundary. Controller then explicitly allowed actual local CLI validation using a tiny separate source fixture and isolated site persistence. Both sites completed real local immutable D1/R2 writes+ACK/readhash and stable retry, with scope local and remoteBindings:false recorded. No remote execution/repair/delete/deploy/account modification was performed by the agent after containment. These local results do not close operational impact.
