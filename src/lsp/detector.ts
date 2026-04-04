/**
 * File extension to language ID mapping and server config lookup.
 *
 * Maps 50+ file extensions to LSP language identifiers, then resolves
 * the appropriate LSPServerConfig for a given language.
 */

import { getAllServerConfigs, type LSPServerConfig } from './servers.js'

/**
 * Comprehensive mapping of file extensions to LSP language identifiers.
 * Covers common languages and their variants.
 */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  // TypeScript / JavaScript
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'typescript',
  '.jsx': 'typescript',
  '.mts': 'typescript',
  '.mjs': 'typescript',
  '.cts': 'typescript',
  '.cjs': 'typescript',

  // Python
  '.py': 'python',
  '.pyi': 'python',
  '.pyw': 'python',
  '.pyx': 'python',

  // Go
  '.go': 'go',

  // Rust
  '.rs': 'rust',

  // C / C++
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'c',
  '.hpp': 'c',
  '.cc': 'c',
  '.hh': 'c',
  '.cxx': 'c',
  '.hxx': 'c',
  '.C': 'c',
  '.H': 'c',

  // Java
  '.java': 'java',

  // Ruby
  '.rb': 'ruby',
  '.rake': 'ruby',
  '.gemspec': 'ruby',
  '.ru': 'ruby',

  // PHP
  '.php': 'php',
  '.phtml': 'php',

  // C#
  '.cs': 'csharp',

  // Swift
  '.swift': 'swift',

  // Kotlin
  '.kt': 'kotlin',
  '.kts': 'kotlin',

  // Zig
  '.zig': 'zig',

  // Lua
  '.lua': 'lua',

  // Dart
  '.dart': 'dart',

  // Elixir
  '.ex': 'elixir',
  '.exs': 'elixir',

  // Erlang
  '.erl': 'erlang',
  '.hrl': 'erlang',

  // Haskell
  '.hs': 'haskell',
  '.lhs': 'haskell',

  // Scala
  '.scala': 'scala',
  '.sc': 'scala',

  // OCaml
  '.ml': 'ocaml',
  '.mli': 'ocaml',

  // Clojure
  '.clj': 'clojure',
  '.cljs': 'clojure',
  '.cljc': 'clojure',

  // Julia
  '.jl': 'julia',

  // R
  '.r': 'r',
  '.R': 'r',

  // Perl
  '.pl': 'perl',
  '.pm': 'perl',

  // Shell
  '.sh': 'shellscript',
  '.bash': 'shellscript',
  '.zsh': 'shellscript',

  // YAML
  '.yaml': 'yaml',
  '.yml': 'yaml',

  // TOML
  '.toml': 'toml',

  // JSON
  '.json': 'json',
  '.jsonc': 'json',

  // XML
  '.xml': 'xml',
  '.xsl': 'xml',
  '.xsd': 'xml',

  // HTML
  '.html': 'html',
  '.htm': 'html',

  // CSS
  '.css': 'css',
  '.scss': 'css',
  '.less': 'css',
  '.sass': 'css',

  // Vue
  '.vue': 'vue',

  // Svelte
  '.svelte': 'svelte',
}

/**
 * Detect the LSP language ID for a file path based on its extension.
 *
 * @param filePath - Absolute or relative file path
 * @returns Language ID string or null if extension is not recognized
 */
export function detectLanguage(filePath: string): string | null {
  // Extract extension, handling multi-part extensions
  const lastDot = filePath.lastIndexOf('.')
  if (lastDot === -1) {
    return null
  }

  const ext = filePath.slice(lastDot)
  return EXTENSION_TO_LANGUAGE[ext] ?? null
}

/**
 * Get the server configuration for a given language ID.
 * Searches custom servers first (last registered wins), then built-in.
 *
 * @param languageId - LSP language identifier (e.g. 'typescript', 'python')
 * @returns Server config or null if no server is configured for this language
 */
export function getServerConfig(languageId: string): LSPServerConfig | null {
  const configs = getAllServerConfigs()

  // Search in reverse so custom configs (appended last) take precedence
  for (let i = configs.length - 1; i >= 0; i--) {
    const config = configs[i]!
    if (config.languageId === languageId) {
      return config
    }
  }

  return null
}

/**
 * Get the server configuration that handles a specific file path.
 * Convenience wrapper that combines detectLanguage + getServerConfig.
 *
 * @param filePath - File path to look up
 * @returns Server config or null if no server handles this file type
 */
export function getServerConfigForFile(filePath: string): LSPServerConfig | null {
  const languageId = detectLanguage(filePath)
  if (!languageId) {
    return null
  }
  return getServerConfig(languageId)
}
