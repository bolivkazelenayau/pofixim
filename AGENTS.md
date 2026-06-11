@C:\Users\Breeze\.codex\RTK.md

<!-- BEGIN:mandatory-command-wrapper -->
# Mandatory command wrapper

Before running any shell command, Codex must ask: "Is this a repository inspection, search, git state/diff/log, test, lint, typecheck, build, or noisy-output command?" If yes, Codex MUST prefix it with `rtk`.

Use `rtk git status --short --branch`, `rtk git diff --stat`, `rtk git diff`, `rtk rg <pattern>`, `rtk npm run lint`, and `rtk npm run build`.

Do not use raw `git`, `rg`, `npm`, `npx`, `npm.cmd`, or similar commands for these tasks unless the user explicitly asks for exact raw output.
<!-- END:mandatory-command-wrapper -->

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
<!-- BEGIN:rtk-command-policy -->
## RTK command policy

For shell commands that inspect repository state, run checks, search code, or can print noisy output, Codex MUST invoke RTK explicitly. Do not run these commands raw.

Required examples:

```powershell
rtk git status --short --branch
rtk git diff --stat
rtk git diff
rtk git log --oneline -n 20
rtk rg <pattern>
rtk npm run lint
rtk npm run build
rtk npx tsc --noEmit
```

Bad examples:

```powershell
git status --short --branch
git diff
npm run lint
npm.cmd run lint
rtk npm.cmd run lint
```

If an RTK command fails because of sandboxing, EPERM, permissions, or network access, retry the same RTK command with escalation. Escalation must not remove `rtk`.

Use raw shell commands only when exact unfiltered output is required, for interactive/risky operations, or for very small file reads where RTK provides no value.
<!-- END:rtk-command-policy -->
