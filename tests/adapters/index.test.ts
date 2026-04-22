import { describe, it, expect } from 'vitest';
import { getAdapter, getSupportedAdapters } from '../../src/adapters/index.js';
import { ClaudeCodeAdapter } from '../../src/adapters/claude-code.js';

describe('adapter registry', () => {
  describe('getAdapter', () => {
    it('returns ClaudeCodeAdapter for claude-code', () => {
      const adapter = getAdapter('claude-code');

      expect(adapter).toBeInstanceOf(ClaudeCodeAdapter);
      expect(adapter.name).toBe('claude-code');
    });

    it('throws error for unknown adapter', () => {
      expect(() => getAdapter('unknown-adapter')).toThrow(
        'Unknown adapter: "unknown-adapter". Supported adapters: claude-code, openai, gemini'
      );
    });

    it('throws error for empty string adapter name', () => {
      expect(() => getAdapter('')).toThrow('Unknown adapter');
    });

    it('returns new instance on each call', () => {
      const adapter1 = getAdapter('claude-code');
      const adapter2 = getAdapter('claude-code');

      expect(adapter1).not.toBe(adapter2);
      expect(adapter1).toBeInstanceOf(ClaudeCodeAdapter);
      expect(adapter2).toBeInstanceOf(ClaudeCodeAdapter);
    });
  });

  describe('getSupportedAdapters', () => {
    it('returns list of supported adapters', () => {
      const adapters = getSupportedAdapters();

      expect(adapters).toEqual(['claude-code', 'openai', 'gemini']);
    });

    it('returns a new array on each call', () => {
      const adapters1 = getSupportedAdapters();
      const adapters2 = getSupportedAdapters();

      expect(adapters1).not.toBe(adapters2);
      expect(adapters1).toEqual(adapters2);
    });

    it('includes claude-code adapter', () => {
      const adapters = getSupportedAdapters();

      expect(adapters).toContain('claude-code');
    });
  });
});
