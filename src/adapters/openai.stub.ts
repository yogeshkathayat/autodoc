import type {
  AIAdapter,
  UpdateInput,
  UpdateResult,
  BootstrapInput,
  BootstrapResult,
} from './types.js';

export class OpenAIAdapter implements AIAdapter {
  readonly name = 'openai';

  async preflight(): Promise<{ ok: boolean; message?: string; installUrl?: string }> {
    throw new Error(
      'OpenAI adapter not implemented in v1. See docs/adapters.md for roadmap.'
    );
  }

  async runUpdate(_input: UpdateInput): Promise<UpdateResult> {
    throw new Error(
      'OpenAI adapter not implemented in v1. See docs/adapters.md for roadmap.'
    );
  }

  async runBootstrap(_input: BootstrapInput): Promise<BootstrapResult> {
    throw new Error(
      'OpenAI adapter not implemented in v1. See docs/adapters.md for roadmap.'
    );
  }
}
