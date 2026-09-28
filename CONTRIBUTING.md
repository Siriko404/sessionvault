# Contributing

Changes should preserve SessionVault's core invariants: local-only serving, explicit user-triggered external actions, no automatic browser opening, and no transcript/credential exfiltration.

Before proposing a change:

```bash
npm ci
npm run build
npm run verify:release
npm test
```

For UI changes, also verify loading/error/empty states, keyboard focus, narrow layouts, and a large transcript. Avoid introducing dependencies for effects that can be implemented with the existing React/Vite stack unless the maintenance/security cost is justified.

Do not include real transcript content in fixtures, screenshots, issues, or pull requests. Use synthetic/redacted data.
