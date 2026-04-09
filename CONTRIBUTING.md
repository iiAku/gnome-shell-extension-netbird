# Contributing

Thanks for your interest in contributing! This project is a GNOME Shell extension written in TypeScript and bundled with Bun.

## Getting started

```bash
git clone https://github.com/iiAku/gnome-shell-extension-netbird.git
cd gnome-shell-extension-netbird
bun install
```

`bun install` also registers git hooks via lefthook. These run automatically on commit and push.

## Development workflow

### Scripts

| Command | What it does |
|---|---|
| `bun run build` | Bundle extension.js + prefs.js via `bun build` |
| `bun run typecheck` | Type-check all three tsconfigs (extension, prefs, test) |
| `bun run lint` | Lint with oxlint |
| `bun run lint:fix` | Auto-fix lint issues |
| `bun run format` | Format with oxfmt |
| `bun run format:check` | Check formatting without writing |
| `bun test` | Run unit tests (Bun test runner) |
| `bun test --watch` | Watch mode for tests |
| `bun run knip` | Detect unused exports and dependencies |

### Makefile targets

| Target | What it does |
|---|---|
| `make install` | Build + copy to `~/.local/share/gnome-shell/extensions/` |
| `make enable` | Enable the extension via `gnome-extensions` |
| `make logs` | Tail GNOME Shell logs filtered for this extension |
| `make pack` | Build a `.shell-extension.zip` (version injected from git tag) |
| `make schemas` | Compile GSettings schemas |

### Typical dev cycle

1. Make your changes in `src/`
2. `make install` to build and deploy locally
3. Log out and back in (Wayland) or `Alt+F2` > `r` (X11) to reload
4. `make logs` in a separate terminal to watch for errors

## Architecture

The extension follows a layered architecture:

- **`extension.ts`** / **`prefs.ts`** — GNOME Shell entry points. Thin wrappers.
- **`indicator.ts`** — The main UI. A `PanelMenu.Button` with a state machine managing the connection lifecycle, polling, and signal handling.
- **`netbird-client.ts`** — Infrastructure adapter. Wraps `Gio.Subprocess` to run `netbird` CLI commands. Throws typed errors.
- **`netbird-args.ts`** / **`netbird-status-parser.ts`** / **`netbird-version-parser.ts`** — Pure functions with no GJS dependencies. Fully unit-testable.
- **`error-report.ts`** — Pure formatter for clipboard error reports. Also fully testable.
- **`constants.ts`** / **`settings.ts`** / **`netbird-state.ts`** — Shared constants and types.

### Key design decisions

- **Pure logic is separated from GJS code.** Parsers, arg builders, and error formatters have zero GJS imports so they can be tested under plain Bun.
- **Bundled output.** `bun build` produces two flat files (`extension.js`, `prefs.js`) with all internal modules inlined. GJS imports (`gi://`, `resource:///`) are preserved as externals.
- **No runtime dependencies.** The extension ships only its own code.
- **Typed errors.** `NetbirdError` subclasses allow pattern matching on failure modes at the UI layer.
- **Feature flag reconnect.** Toggling flags while connected triggers a transparent `down` > `up` cycle instead of requiring manual reconnection.

## Testing

Tests live in `test/unit/` and run under Bun's built-in test runner.

```bash
bun test                          # run all tests
bun test test/unit/some.test.ts   # run a specific file
bun test --watch                  # watch mode
```

### What to test

- **Pure functions** (parsers, arg builders, error formatting) — test all branches and edge cases.
- **Error classes** — verify `instanceof` chains and property access.
- **New features** — if you add a new parser or utility, add tests alongside.

### What's hard to test

`indicator.ts` and `netbird-client.ts` depend on GJS primitives (`Gio.Subprocess`, `St.Clipboard`, GObject signals). Testing these requires either mocking the GJS runtime or extracting logic into testable pure functions. Contributions to improve testability here are very welcome.

## Code style

- **TypeScript strict mode** — no `any`, no implicit `null`
- **oxlint** for linting, **oxfmt** for formatting — both enforced by git hooks
- **knip** for dead code detection — enforced on push
- Arrow functions in flat modules, regular methods in classes
- `as const` objects for enums and constants
- Early returns, guard clauses, minimal nesting
- Comments explain *why*, not *what*

## Submitting changes

1. Fork the repo and create a branch from `main`
2. Make your changes with tests where possible
3. Ensure the full check suite passes: `bun run lint && bun run format:check && bun run typecheck && bun test && bun run build && bun run knip`
4. Open a pull request against `main`

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(indicator): add keyboard shortcut for connect
fix(parser): preserve CIDR notation in IP address
docs: update contributing guide
chore: bump GNOME Shell types
```

### Pull request guidelines

- Keep PRs focused — one feature or fix per PR
- Include tests for new pure-function logic
- Update the README if you change user-facing behavior
- Don't worry about perfection — we'll iterate together in review

## Reporting bugs

When an error occurs, the extension copies a detailed report to your clipboard automatically. Paste it into a [new issue](https://github.com/iiAku/gnome-shell-extension-netbird/issues/new?template=bug_report.yml) — it includes versions, OS, session type, and a stack trace.

If the error doesn't trigger the clipboard copy (e.g., the extension fails to load), check `make logs` output and include the relevant lines.

## Releasing

Releases are fully automated. The version in the packaged zip is derived from the git tag — no manual version bumping needed.

```bash
git tag v3
git push origin main --tags
```

This triggers the release workflow which:
1. Runs the full CI checks
2. Packs the extension with the tag version injected into `metadata.json`
3. Creates a GitHub Release with the zip attached
4. Publishes to the GNOME Extensions marketplace (when enabled)

## Questions?

Open a [discussion](https://github.com/iiAku/gnome-shell-extension-netbird/discussions) or file an issue. There are no dumb questions.
