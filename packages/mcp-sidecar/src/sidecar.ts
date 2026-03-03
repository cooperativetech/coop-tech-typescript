import { createRequire } from 'node:module'
import WebSocket from 'ws'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolInfo, ServerMessage, ToolCallMessage } from './types'

const require = createRequire(import.meta.url)
const { version: packageVersion } = require('../package.json') as { version: string }

const DEFAULT_URL = 'wss://coop.tech/mcp-sidecar'
const RECONNECT_INTERVAL_MS = 5000
const HEARTBEAT_INTERVAL_MS = 30000
const DEFAULT_TOOL_TIMEOUT_MS = 60000

export interface SidecarConfig {
  // Connection to coop.tech
  token: string
  url?: string

  // MCP server source (one of):
  server?: McpServer
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string

  // Required metadata
  description: string

  // Optional overrides
  name?: string
  version?: string
  instructions?: string

  // Options
  logLevel?: 'normal' | 'verbose' | 'quiet'
  toolTimeoutMs?: number // default: 60s, max: 1 hour
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Error) => void
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max) + '...'
}

export class Sidecar {
  private config: Required<Pick<SidecarConfig, 'token' | 'url' | 'toolTimeoutMs'>> & SidecarConfig
  private logLevel: 'normal' | 'verbose' | 'quiet'
  private mcpClient: Client | null = null
  private ws: WebSocket | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  private tools: ToolInfo[] = []
  private serverName = ''
  private serverVersion = ''
  private closed = false

  constructor(config: SidecarConfig) {
    if (!config.token) throw new Error('token is required')
    if (!config.server && !config.command) throw new Error('Either server or command is required')
    if (!config.description) throw new Error('description is required')

    this.config = {
      ...config,
      url: config.url ?? DEFAULT_URL,
      toolTimeoutMs: config.toolTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
    }
    this.logLevel = config.logLevel ?? 'normal'
  }

  async connect(): Promise<void> {
    // Step 1: Connect to MCP server and discover tools
    await this.connectMcpServer()

    // Step 2: Connect to coop.tech WebSocket
    await this.connectWebSocket()
  }

  async close(): Promise<void> {
    this.closed = true
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close(1000, 'Client closing')
      this.ws = null
    }
    if (this.mcpClient) {
      await this.mcpClient.close().catch(() => {})
      this.mcpClient = null
    }
  }

  private async connectMcpServer(): Promise<void> {
    this.mcpClient = new Client({ name: 'coop-sidecar', version: packageVersion })

    if (this.config.server) {
      // Library mode: in-process McpServer
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      await this.config.server.connect(serverTransport)
      await this.mcpClient.connect(clientTransport)
    } else if (this.config.command) {
      // Stdio mode: spawn external process
      const transport = new StdioClientTransport({
        command: this.config.command,
        args: this.config.args,
        env: this.config.env ? { ...process.env, ...this.config.env } as Record<string, string> : undefined,
        cwd: this.config.cwd,
      })
      await this.mcpClient.connect(transport)
    }

    const mcpServerVersion = this.mcpClient.getServerVersion()

    // Use config overrides or fall back to MCP server values
    this.serverName = this.config.name ?? mcpServerVersion?.name ?? ''
    this.serverVersion = this.config.version ?? mcpServerVersion?.version ?? ''

    if (!this.serverName) {
      throw new Error('MCP server must return a name in its initialize response (serverInfo.name), or provide a name via config')
    }

    // Discover tools
    const result = await this.mcpClient.listTools()
    this.tools = result.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    }))

    if (this.logLevel !== 'quiet') {
      console.log(`[coop-sidecar] Discovered ${this.tools.length} tool(s) from MCP server "${this.serverName}"`)
    }
  }

  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.config.url)
      this.ws = ws

      let authenticated = false

      ws.on('open', () => {
        // Send auth message
        ws.send(JSON.stringify({
          type: 'auth',
          token: this.config.token,
          serverName: this.serverName,
          description: this.config.description,
          instructions: this.config.instructions,
          tools: this.tools,
          version: this.serverVersion,
          sdkVersion: packageVersion,
          toolTimeoutMs: this.config.toolTimeoutMs,
        }))
      })

      ws.on('message', (rawData: WebSocket.RawData) => {
        let msg: ServerMessage
        try {
          const text = typeof rawData === 'string' ? rawData : Buffer.from(rawData as ArrayBuffer).toString()
          msg = JSON.parse(text) as ServerMessage
        } catch {
          return
        }

        if (msg.type === 'auth_ok') {
          authenticated = true
          this.startHeartbeat()
          if (this.logLevel !== 'quiet') {
            console.log(`[coop-sidecar] Connected as "${this.serverName}" (id: ${msg.serverId})`)
          }
          this.config.onConnect?.()
          resolve()
          return
        }

        if (msg.type === 'auth_error') {
          const err = new Error(`Authentication failed: ${msg.message}`)
          this.config.onError?.(err)
          reject(err)
          return
        }

        if (msg.type === 'tool_call') {
          void this.handleToolCall(msg)
          return
        }

        if (msg.type === 'pong') {
          return
        }
      })

      ws.on('close', () => {
        this.stopHeartbeat()
        this.config.onDisconnect?.()

        if (!this.closed && authenticated) {
          if (this.logLevel !== 'quiet') {
            console.log(`[coop-sidecar] Disconnected. Reconnecting in ${RECONNECT_INTERVAL_MS}ms...`)
          }
          this.reconnectTimer = setTimeout(() => {
            this.connectWebSocket().catch((err) => {
              this.config.onError?.(err instanceof Error ? err : new Error(String(err)))
            })
          }, RECONNECT_INTERVAL_MS)
        }
      })

      ws.on('error', (err) => {
        this.config.onError?.(err)
        if (!authenticated) {
          reject(err)
        }
      })
    })
  }

  private async handleToolCall(msg: ToolCallMessage): Promise<void> {
    if (!this.mcpClient || !this.ws) return

    const maxLen = this.logLevel === 'verbose' ? Infinity : 100

    if (this.logLevel !== 'quiet') {
      const argsStr = truncate(JSON.stringify(msg.arguments), maxLen)
      console.log(`[coop-sidecar] Tool call: ${msg.name} args=${argsStr}`)
    }

    try {
      const result = await this.mcpClient.callTool({
        name: msg.name,
        arguments: msg.arguments,
      }, undefined, { timeout: this.config.toolTimeoutMs })

      const content = Array.isArray(result.content)
        ? (result.content as Array<{ type: string; text: string }>)
        : [{ type: 'text', text: String(result.content) }]

      if (this.logLevel !== 'quiet') {
        const contentStr = truncate(JSON.stringify(content), maxLen)
        console.log(`[coop-sidecar] Tool result: ${msg.name} isError=${Boolean(result.isError)} content=${contentStr}`)
      }

      this.ws.send(JSON.stringify({
        type: 'tool_result',
        requestId: msg.requestId,
        result: { content, isError: result.isError },
      }))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (this.logLevel !== 'quiet') {
        console.log(`[coop-sidecar] Tool error: ${msg.name} ${errorMessage}`)
      }

      this.ws?.send(JSON.stringify({
        type: 'tool_result',
        requestId: msg.requestId,
        result: {
          content: [{ type: 'text', text: `Error: ${errorMessage}` }],
          isError: true,
        },
      }))
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }
}
