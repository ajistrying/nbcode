// Re-export shim -- consolidated into bashSecurity.ts
export {
  applySedSubstitution,
  isSedInPlaceEdit,
  parseSedEditCommand,
} from './bashSecurity.js'
export type { SedEditInfo } from './bashSecurity.js'
