// The codes the agent and the API emit with the computer spelling are matched
// together with the spelling before the rename, so a Hub and an agent updated at different times still agree.
import { describe, expect, it } from 'vitest';
import { REFUSED } from '../journal/proof';
import { refusalOf } from '../../pages/computers/parts/Firewall';

describe('a create refused with either spelling is a refusal before dispatch', () => {
  for (const [oldCode, newCode] of [['container_conflict', 'computer_conflict'], ['container_gone', 'computer_gone'], ['acp_container_unsupported', 'acp_computer_unsupported']] as const) {
    it(`${oldCode} and ${newCode}`, () => {
      expect(REFUSED.create.has(oldCode)).toBe(true);
      expect(REFUSED.create.has(newCode)).toBe(true);
    });
  }
  it('no other route lists them', () => {
    for (const r of ['turn', 'command', 'confirm', 'answer'] as const) for (const c of ['container_conflict', 'computer_conflict']) expect(REFUSED[r].has(c)).toBe(false);
  });
});

describe('the 409 finalizing marker, either spelling', () => {
  it('reads as finalizing', () => {
    expect(refusalOf({ code: 'computer_finalizing', status: 409 })).toBe('finalizing');
    expect(refusalOf({ code: 'container_finalizing', status: 409 })).toBe('finalizing');
  });
  it('a 409 with another code is not finalizing', () => {
    expect(refusalOf({ code: 'something_else', status: 409 })).not.toBe('finalizing');
  });
});

// Firewall refusals: the limit codes read as "full" under either spelling (an old-spelling limit code on a 409 used to fall through to "gone").
describe('firewall limit codes, either spelling', () => {
  it('reads COMPUTER_ and CONTAINER_ limit codes as full, even on a 409', () => {
    for (const code of ['COMPUTER_FIREWALL_RULE_LIMIT', 'CONTAINER_FIREWALL_RULE_LIMIT', 'COMPUTER_FIREWALL_BYTES_LIMIT', 'CONTAINER_FIREWALL_BYTES_LIMIT']) {
      expect(refusalOf({ code, status: 409 })).toBe('full');
    }
  });
});
