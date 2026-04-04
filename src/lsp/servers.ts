/**
 * Language server configurations for auto-detection.
 *
 * Each config specifies how to launch an LSP server for a given language,
 * which file extensions it handles, and which root pattern files indicate
 * a project root for that language.
 *
 * Users must have the server binary installed -- we detect availability
 * via `which` before attempting to spawn.
 */

export interface LSPServerConfig {
  /** LSP language identifier (e.g. 'typescript', 'python') */
  languageId: string
  /** Human-readable name for logging */
  displayName: string
  /** Executable command (e.g. 'typescript-language-server') */
  command: string
  /** Arguments to pass to the server (e.g. ['--stdio']) */
  args: string[]
  /** Files that indicate a project root (e.g. ['package.json', 'tsconfig.json']) */
  rootPatterns: string[]
  /** File extensions this server handles (e.g. ['.ts', '.tsx']) */
  fileExtensions: string[]
  /** Optional initialization options to pass to the server */
  initializationOptions?: Record<string, unknown>
}

/**
 * Built-in language server configurations.
 *
 * These cover the most common languages. Users can extend this list
 * via registerCustomServer().
 */
const BUILTIN_SERVERS: LSPServerConfig[] = [
  {
    languageId: 'typescript',
    displayName: 'TypeScript',
    command: 'typescript-language-server',
    args: ['--stdio'],
    rootPatterns: ['package.json', 'tsconfig.json', 'jsconfig.json'],
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs'],
  },
  {
    languageId: 'python',
    displayName: 'Python (Pyright)',
    command: 'pyright-langserver',
    args: ['--stdio'],
    rootPatterns: ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile', 'pyrightconfig.json'],
    fileExtensions: ['.py', '.pyi'],
  },
  {
    languageId: 'go',
    displayName: 'Go (gopls)',
    command: 'gopls',
    args: ['serve'],
    rootPatterns: ['go.mod', 'go.sum'],
    fileExtensions: ['.go'],
  },
  {
    languageId: 'rust',
    displayName: 'Rust (rust-analyzer)',
    command: 'rust-analyzer',
    args: [],
    rootPatterns: ['Cargo.toml', 'Cargo.lock'],
    fileExtensions: ['.rs'],
  },
  {
    languageId: 'c',
    displayName: 'C/C++ (clangd)',
    command: 'clangd',
    args: ['--log=error'],
    rootPatterns: ['compile_commands.json', 'CMakeLists.txt', 'Makefile', '.clangd', '.clang-format'],
    fileExtensions: ['.c', '.h', '.cpp', '.hpp', '.cc', '.hh', '.cxx', '.hxx', '.C', '.H'],
  },
  {
    languageId: 'java',
    displayName: 'Java (jdtls)',
    command: 'jdtls',
    args: [],
    rootPatterns: ['pom.xml', 'build.gradle', 'build.gradle.kts', '.project', 'settings.gradle'],
    fileExtensions: ['.java'],
  },
  {
    languageId: 'ruby',
    displayName: 'Ruby (Solargraph)',
    command: 'solargraph',
    args: ['stdio'],
    rootPatterns: ['Gemfile', '.ruby-version', 'Rakefile'],
    fileExtensions: ['.rb', '.rake', '.gemspec'],
  },
  {
    languageId: 'php',
    displayName: 'PHP (Intelephense)',
    command: 'intelephense',
    args: ['--stdio'],
    rootPatterns: ['composer.json', 'composer.lock', 'artisan'],
    fileExtensions: ['.php'],
  },
  {
    languageId: 'csharp',
    displayName: 'C# (OmniSharp)',
    command: 'omnisharp',
    args: ['-lsp'],
    rootPatterns: ['*.csproj', '*.sln', 'global.json'],
    fileExtensions: ['.cs'],
  },
  {
    languageId: 'swift',
    displayName: 'Swift (SourceKit-LSP)',
    command: 'sourcekit-lsp',
    args: [],
    rootPatterns: ['Package.swift', '*.xcodeproj', '*.xcworkspace'],
    fileExtensions: ['.swift'],
  },
  {
    languageId: 'kotlin',
    displayName: 'Kotlin',
    command: 'kotlin-language-server',
    args: [],
    rootPatterns: ['build.gradle.kts', 'build.gradle', 'settings.gradle.kts'],
    fileExtensions: ['.kt', '.kts'],
  },
  {
    languageId: 'zig',
    displayName: 'Zig (zls)',
    command: 'zls',
    args: [],
    rootPatterns: ['build.zig', 'build.zig.zon'],
    fileExtensions: ['.zig'],
  },
]

/**
 * Registry of custom server configs added at runtime.
 */
const customServers: LSPServerConfig[] = []

/**
 * Get all known server configurations (built-in + custom).
 * Custom servers are appended after built-in ones so they can
 * override built-in configs for the same extensions if needed.
 */
export function getAllServerConfigs(): LSPServerConfig[] {
  return [...BUILTIN_SERVERS, ...customServers]
}

/**
 * Register a custom LSP server configuration.
 * Useful for languages not covered by built-in configs.
 */
export function registerCustomServer(config: LSPServerConfig): void {
  customServers.push(config)
}

/**
 * Clear all custom server registrations.
 * Primarily for testing.
 */
export function clearCustomServers(): void {
  customServers.length = 0
}
