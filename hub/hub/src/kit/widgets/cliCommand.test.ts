// The one kit
// helper that writes a hoody CLI command for the platform the Hub runs on.
import { describe, expect, it } from 'vitest';
import { cliCommand, platformHosts } from './agentHints';

describe('cliCommand', () => {
  it('on hoody.com, the CLI\'s default platform, the command names no --base-url', () => {
    expect(cliCommand('login', platformHosts('api.hoody.com'))).toBe('hoody login');
    expect(cliCommand('computers list', platformHosts('API.Hoody.COM:443'))).toBe('hoody computers list');
    // Not a known api.<domain> page host (a dev server, a bare host): the hosts are hoody.com's, so no flag either.
    expect(cliCommand('login', platformHosts('localhost:5173'))).toBe('hoody login');
  });

  it('on another platform it names that platform\'s API, which the CLI from npm would not call by itself', () => {
    expect(cliCommand('login', platformHosts('api.example.test'))).toBe('hoody --base-url https://api.example.test login');
    expect(cliCommand('computers list', platformHosts('api.example.net'))).toBe('hoody --base-url https://api.example.net computers list');
  });
});
