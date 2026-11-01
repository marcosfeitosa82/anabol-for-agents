# Adapters

Anabol's core knows nothing about OpenCode, Claude, or any other host. An adapter supplies
two host-specific facts:

1. **Where the skills root is** — the directory that contains one sub-directory per
   registered skill, each with a `SKILL.md`.
2. **How the host reads a line range** — or, if it cannot, the adapter can expose the CLI.

Everything else (merge, index, fallback) is shared.

## The generic contract

```js
const { createAdapter } = require('./src/adapters/generic');

const adapter = createAdapter({ name: 'my-host', skillsRoot: '/path/to/skills' });

adapter.install('/path/to/package');   // merge, never add skills
adapter.index();                       // rebuild .anabol/index.json
adapter.list();                        // indexed segments
adapter.read('sql-injection-scan');    // segment text + fallback
adapter.readHint(segment);             // { path, offset, limit }
```

`readHint` is the important one: it converts an index entry into the host's native
"read only this range" call.

| Index field | Host read argument |
| --- | --- |
| `file` | `path` (joined to `skillsRoot`) |
| `startLine` | `offset` (1-based) |
| `endLine - startLine + 1` | `limit` |

## OpenCode

```js
const { createOpenCodeAdapter } = require('./src/adapters/opencode');
const adapter = createOpenCodeAdapter(); // ~/.config/opencode/skills
```

Resolution order:

1. explicit `skillsRoot` / `configDir`;
2. `OPENCODE_CONFIG_DIR`;
3. `XDG_CONFIG_HOME/opencode`;
4. `~/.config/opencode`.

OpenCode auto-discovers `skills/*/SKILL.md`, so installing a package must not create a new
directory there. Anabol writes into existing ones. The orchestrator uses OpenCode's
`read(path, offset, limit)` to fetch one segment.

## Adding another host

1. Create `src/adapters/<host>.js`.
2. Resolve the host's skills root (env var, config file, platform default).
3. Return `createAdapter({ name, skillsRoot })`.
4. Document how the host reads a line range in this file.
5. Add a test that resolution honours the env override and that `readHint` maps correctly.

If the host cannot read a line range natively, expose the CLI instead:

```bash
node src/cli.js find --structure <root> --query "<task>"
node src/cli.js read --structure <root> --id <segment-id>
```

The CLI performs the same anchor check and marker fallback, so the host still gets the right
segment — it just pays a process spawn instead of a native partial read.

## Constraints

- Do not copy merged content into a second skill file; that defeats the count invariant.
- Do not rely on MCP tools or hooks for routing; a plain file read must be enough.
- Keep adapters thin. Categorization and merging belong to the core.
