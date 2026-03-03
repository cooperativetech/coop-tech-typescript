export { Sidecar } from './sidecar.js'
export type { SidecarConfig } from './sidecar.js'
export type { ToolInfo } from './types.js'

import type { SidecarConfig } from './sidecar.js'
import { Sidecar } from './sidecar.js'

/**
 * Connect an MCP server to coop.tech as a sidecar.
 *
 * @example Library mode (in-process McpServer):
 * ```ts
 * import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
 * import { connectSidecar } from '@coop-tech/mcp-sidecar'
 *
 * const server = new McpServer({ name: 'my-tools', version: '1.0.0' })
 * server.tool('analyze', 'Analyze data', { query: z.string() }, async ({ query }) => { ... })
 *
 * await connectSidecar({
 *   server,
 *   token: process.env.COOP_TECH_TOKEN!,
 * })
 * ```
 *
 * @example Stdio mode (spawn external process):
 * ```ts
 * await connectSidecar({
 *   command: 'python',
 *   args: ['my_mcp_server.py'],
 *   token: process.env.COOP_TECH_TOKEN!,
 * })
 * ```
 */
export async function connectSidecar(config: SidecarConfig): Promise<Sidecar> {
  const sidecar = new Sidecar(config)
  await sidecar.connect()
  return sidecar
}
