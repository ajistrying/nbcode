// Re-export shim -- consolidated into bashSecurity.ts
export {
  checkPathConstraints,
  COMMAND_OPERATION_TYPE,
  createPathChecker,
  PATH_EXTRACTORS,
  stripWrappersFromArgv,
} from './bashSecurity.js'
export type { PathCommand } from './bashSecurity.js'
