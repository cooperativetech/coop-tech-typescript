#!/usr/bin/env node

import { parseArgs } from 'node:util'
import { connectSidecar } from './index.js'

function printUsage(): void {
  console.log(`Usage: coop-mcp-sidecar [options] [-- command [args...]]

Options:
  --token <token>             Personal access token (or set COOP_TECH_TOKEN env var)
  --url <url>                 Server URL (default: wss://coop.tech/mcp-sidecar)
  --command <cmd>             MCP server command to spawn
  --description <description> Description of what this server does (required)
  --instructions <text>       Additional instructions for the agent
  --name <name>               Override the server name reported to coop.tech
  --version <version>         Override the server version reported to coop.tech
  --verbose                   Log full tool call arguments and results
  --quiet                     Suppress all tool call and connection logs
  --help                      Show this help message

Examples:
  # Spawn an MCP server via stdio:
  coop-mcp-sidecar --token YOUR_TOKEN --description "Manages database queries" --command "python my_server.py"

  # Using -- separator for command with arguments:
  coop-mcp-sidecar --token YOUR_TOKEN --description "Code search agent" -- claude mcp serve

  # Override the server name and version:
  coop-mcp-sidecar --token YOUR_TOKEN --description "My server" --name my-server --version 2.0.0 -- python my_server.py

  # Using environment variable:
  COOP_TECH_TOKEN=YOUR_TOKEN coop-mcp-sidecar --description "My server" -- python my_server.py`)
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      token: { type: 'string' },
      url: { type: 'string' },
      command: { type: 'string' },
      description: { type: 'string' },
      instructions: { type: 'string' },
      name: { type: 'string' },
      version: { type: 'string' },
      verbose: { type: 'boolean' },
      quiet: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  })

  if (values.help) {
    printUsage()
    process.exit(0)
  }

  const token = values.token ?? process.env.COOP_TECH_TOKEN
  const url = values.url
  let command = values.command
  let commandArgs: string[] = []

  if (positionals.length > 0) {
    command = positionals[0]
    commandArgs = positionals.slice(1)
  }

  if (!token) {
    console.error('Error: --token is required (or set COOP_TECH_TOKEN environment variable)')
    process.exit(1)
  }

  if (!command) {
    console.error('Error: --command is required (or use -- separator)')
    printUsage()
    process.exit(1)
  }

  const description = values.description
  if (!description) {
    console.error('Error: --description is required')
    printUsage()
    process.exit(1)
  }

  const logLevel = values.quiet ? 'quiet' as const : values.verbose ? 'verbose' as const : 'normal' as const

  if (logLevel !== 'quiet') {
    console.log(`[coop-sidecar] Starting MCP server: ${command} ${commandArgs.join(' ')}`)
  }

  const sidecar = await connectSidecar({
    token,
    url,
    command,
    args: commandArgs,
    description,
    instructions: values.instructions,
    name: values.name,
    version: values.version,
    logLevel,
    reconnect: true,
    onConnect: () => console.log('[coop-sidecar] Connected to coop.tech'),
    onDisconnect: () => console.log('[coop-sidecar] Disconnected from coop.tech'),
    onError: (err) => console.error('[coop-sidecar] Error:', err.message),
  })

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\n[coop-sidecar] Shutting down...')
    await sidecar.close()
    process.exit(0)
  }

  process.on('SIGINT', () => { void shutdown() })
  process.on('SIGTERM', () => { void shutdown() })
}

main().catch((err) => {
  console.error('[coop-sidecar] Fatal error:', err)
  process.exit(1)
})
