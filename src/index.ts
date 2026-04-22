export { detectFramework, type Framework, type FrameworkDetectionResult } from "./detect.js";
export {
  loadManifest,
  validateManifest,
  resolveAffectedDocs,
  type Manifest,
  type ManifestMapping,
  type ValidationResult,
  type AffectedDoc,
} from "./manifest.js";
export type {
  AIAdapter,
  UpdateInput,
  UpdateResult,
  BootstrapInput,
  BootstrapResult,
} from "./adapters/types.js";
export { getAdapter } from "./adapters/index.js";
export {
  scanModules,
  generateModuleMappings,
  type ScannedModule,
  type ScanResult,
} from "./scanner.js";
