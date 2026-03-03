# @coop-tech/mcp-sidecar

Connect MCP servers to [coop.tech](https://coop.tech) as sidecars.

## Install

```bash
npm install @coop-tech/mcp-sidecar
```

## Library usage

Connect an in-process MCP server:

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { connectSidecar } from '@coop-tech/mcp-sidecar'

const server = new McpServer({ name: 'my-tools', version: '1.0.0' })
server.tool('analyze', 'Analyze data', { query: z.string() }, async ({ query }) => {
  return { content: [{ type: 'text', text: 'result' }] }
})

await connectSidecar({
  server,
  token: process.env.COOP_TECH_TOKEN!,
  description: 'Analyzes data',
})
```

## CLI usage

Spawn an external MCP server and connect it:

```bash
# Using --command:
coop-mcp-sidecar --token YOUR_TOKEN --description "My server" --command "python my_server.py"

# Using -- separator:
coop-mcp-sidecar --token YOUR_TOKEN --description "My server" -- python my_server.py

# Using env var:
COOP_TECH_TOKEN=YOUR_TOKEN coop-mcp-sidecar --description "My server" -- python my_server.py
```

### CLI options

| Option | Description |
|--------|-------------|
| `--token <token>` | Personal access token (or `COOP_TECH_TOKEN` env var) |
| `--url <url>` | Server URL (default: `wss://coop.tech/mcp-sidecar`) |
| `--command <cmd>` | MCP server command to spawn (or use `--` separator) |
| `--description <text>` | Description of the server (required) |
| `--instructions <text>` | Additional instructions for the agent |
| `--name <name>` | Override server name |
| `--version <version>` | Override server version |
| `--tool-timeout <ms>` | Tool call timeout in ms (default: 60000, max: 1 hour) |
| `--verbose` | Log full tool call arguments and results |
| `--quiet` | Suppress all logs |

## API

### `connectSidecar(config): Promise<Sidecar>`

Creates and connects a sidecar. Config options:

- **`token`** (required) - coop.tech personal access token
- **`description`** (required) - description of what the server does
- **`server`** - in-process `McpServer` instance (library mode)
- **`command`** / **`args`** / **`env`** / **`cwd`** - external MCP server (stdio mode)
- **`url`** - coop.tech WebSocket URL (default: `wss://coop.tech/mcp-sidecar`)
- **`name`** / **`version`** - override server name/version
- **`instructions`** - additional agent instructions
- **`logLevel`** - `'normal'` | `'verbose'` | `'quiet'`
- **`reconnect`** - auto-reconnect on disconnect (default: `true`)
- **`onConnect`** / **`onDisconnect`** / **`onError`** - lifecycle callbacks
