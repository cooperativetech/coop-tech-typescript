// Protocol messages: Sidecar -> Server
export interface AuthMessage {
  type: 'auth'
  token: string
  serverName: string
  description: string
  instructions?: string
  tools: ToolInfo[]
  version: string
  sdkVersion: string
}

export interface ToolResultMessage {
  type: 'tool_result'
  requestId: string
  result: { content: Array<{ type: string; text: string }>; isError?: boolean }
}

export interface PingMessage {
  type: 'ping'
}

// Protocol messages: Server -> Sidecar
export interface AuthOkMessage {
  type: 'auth_ok'
  serverId: string
}

export interface AuthErrorMessage {
  type: 'auth_error'
  message: string
}

export interface ToolCallMessage {
  type: 'tool_call'
  requestId: string
  name: string
  arguments: Record<string, unknown>
}

export interface PongMessage {
  type: 'pong'
}

export interface ToolInfo {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

export type ServerMessage = AuthOkMessage | AuthErrorMessage | ToolCallMessage | PongMessage
