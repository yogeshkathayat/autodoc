import type { AIAdapter } from './types.js';
import { ClaudeCodeAdapter } from './claude-code.js';
import { OpenAIAdapter } from './openai.stub.js';
import { GeminiAdapter } from './gemini.stub.js';

const SUPPORTED_ADAPTERS = ['claude-code', 'openai', 'gemini'] as const;
type SupportedAdapter = typeof SUPPORTED_ADAPTERS[number];

const adapterRegistry = new Map<SupportedAdapter, () => AIAdapter>([
  ['claude-code', () => new ClaudeCodeAdapter()],
  ['openai', () => new OpenAIAdapter()],
  ['gemini', () => new GeminiAdapter()],
]);

export function getAdapter(name: string): AIAdapter {
  const factory = adapterRegistry.get(name as SupportedAdapter);

  if (!factory) {
    throw new Error(
      `Unknown adapter: "${name}". Supported adapters: ${SUPPORTED_ADAPTERS.join(', ')}`
    );
  }

  return factory();
}

export function getSupportedAdapters(): string[] {
  return [...SUPPORTED_ADAPTERS];
}

export { AIAdapter } from './types.js';
export type {
  UpdateInput,
  UpdateResult,
  BootstrapInput,
  BootstrapResult,
  AffectedDoc,
  ManifestMapping,
} from './types.js';
