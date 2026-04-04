// Re-export shim -- consolidated into bashSecurity.ts
export {
  checkSedConstraints,
  extractSedExpressions,
  hasFileArgs,
  isLinePrintingCommand,
  isPrintCommand,
  sedCommandIsAllowedByAllowlist,
} from './bashSecurity.js'
