// ============================================
// Command API - 命令列表和执行
// ============================================

import { get, post } from './http'
import { formatPathForApi } from '../utils/directoryUtils'
import { summarizeSession } from './session'

export interface Command {
  name: string
  description?: string
  keybind?: string
}

// ============================================
// Built-in Command Abstraction Layer
// ============================================

/**
 * Context passed to built-in command handlers.
 * Carries all dependencies a handler might need.
 */
export interface BuiltinCommandContext {
  /** Current session ID (may be null if requiresSession is false) */
  sessionId: string | null
  /** Currently selected model */
  currentModel: { providerId: string; id: string } | undefined
  /** Effective working directory */
  effectiveDirectory: string
  /** Navigate to home (clear session from route) */
  navigateHome: () => void
  /** Clear current session state in UI */
  handleNewChat: () => void
}

/**
 * Definition of a built-in command with metadata and execution handler.
 */
export interface BuiltinCommandConfig {
  /** Command name (without leading /) */
  name: string
  /** Human-readable description shown in the slash menu */
  description: string
  /** If true, a session will be auto-created before execute() is called */
  requiresSession: boolean
  /** Execute the command */
  execute: (ctx: BuiltinCommandContext, args: string) => Promise<void>
}

/**
 * Registry of built-in commands handled by dedicated endpoints or UI actions,
 * not returned by GET /command.
 * Mirrors the official web app's hardcoded command registrations.
 */
const BUILTIN_COMMAND_REGISTRY: BuiltinCommandConfig[] = [
  {
    name: 'compact',
    description: 'Compact session by summarizing conversation history',
    requiresSession: true,
    execute: async (ctx) => {
      if (!ctx.currentModel) {
        throw new Error('No model selected')
      }
      await summarizeSession(
        ctx.sessionId!,
        { providerID: ctx.currentModel.providerId, modelID: ctx.currentModel.id },
        ctx.effectiveDirectory
      )
    },
  },
  {
    name: 'new',
    description: 'Create a new session',
    requiresSession: false,
    execute: async (ctx) => {
      ctx.navigateHome()
      ctx.handleNewChat()
    },
  },
]

/**
 * Look up a built-in command by name.
 * Returns undefined if the command is not a built-in.
 */
export function getBuiltinCommand(name: string): BuiltinCommandConfig | undefined {
  return BUILTIN_COMMAND_REGISTRY.find(c => c.name === name)
}

// Derive the Command[] list from the registry for the slash menu
const BUILTIN_COMMANDS: Command[] = BUILTIN_COMMAND_REGISTRY.map(({ name, description }) => ({
  name,
  description,
}))

export async function getCommands(directory?: string): Promise<Command[]> {
  let apiCommands: Command[] = []
  try {
    apiCommands = await get<Command[]>('/command', { directory: formatPathForApi(directory) })
  } catch {
    // Backend unreachable — builtins still available
  }
  const apiNames = new Set(apiCommands.map(c => c.name))
  return [...apiCommands, ...BUILTIN_COMMANDS.filter(c => !apiNames.has(c.name))]
}

export async function executeCommand(
  sessionId: string,
  command: string,
  args: string = '',
  directory?: string
): Promise<unknown> {
  return post(
    `/session/${sessionId}/command`,
    { directory: formatPathForApi(directory) },
    { command, arguments: args }
  )
}
