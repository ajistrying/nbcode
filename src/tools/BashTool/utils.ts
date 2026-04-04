// Re-export shim -- consolidated into bashShell.ts
export {
  buildImageToolResult,
  createContentSummary,
  formatOutput,
  isImageOutput,
  parseDataUri,
  resetCwdIfOutsideProject,
  resizeShellImageOutput,
  stdErrAppendShellResetMessage,
  stripEmptyLines,
} from './bashShell.js'
