@C:\Users\Breeze\.codex\RTK.md

<!-- BEGIN:mandatory-command-wrapper -->
# Mandatory command wrapper

Before running any shell command, Codex must ask: "Is this a repository inspection, search, git state/diff/log, test, lint, typecheck, build, or noisy-output command?" If yes, Codex MUST prefix it with `rtk`.

Use `rtk git status --short --branch`, `rtk git diff --stat`, `rtk git diff`, `rtk rg <pattern>`, `rtk npm run lint`, and `rtk npm run build`.

Do not use raw `git`, `rg`, `npm`, `npx`, `npm.cmd`, or similar commands for these tasks unless the user explicitly asks for exact raw output.
<!-- END:mandatory-command-wrapper -->

<!-- BEGIN:cyrillic-encoding-policy -->
# Cyrillic encoding policy

Do not use PowerShell output as a source of truth for Cyrillic text. In this workspace PowerShell can display UTF-8 text as mojibake (`Ð...`) when console/file encodings disagree.

When reading or patching files that contain Cyrillic:

- Do not use PowerShell `Get-Content` to inspect files that may contain Cyrillic.
- Use an encoding-safe reader such as Node `fs.readFileSync(path, 'utf8')`, editor/resource views, or `rtk git diff` output instead.
- Prefer patch contexts anchored on ASCII-only identifiers, function names, props, imports, class names, or structural code.
- Do not rely on Cyrillic lines copied from PowerShell output for `apply_patch` context.
- Do not rewrite whole files just because a patch containing Cyrillic context does not match.
- If exact Cyrillic text must be inspected, use an encoding-safe reader/tool and preserve the original bytes/UTF-8 text.
- Keep edits minimal and avoid changing Russian copy unless the task explicitly asks for copy changes.
<!-- END:cyrillic-encoding-policy -->

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
