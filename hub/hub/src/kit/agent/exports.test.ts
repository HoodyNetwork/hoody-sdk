// Vitest: the agent kit's public surface is exported from the kit barrel, and the barrel still carries what other pages
// import (EndpointRevNote, useEndpointRev and the SettingGroup family among them).
import { describe, expect, it } from 'vitest';
import * as kit from '../index';

const AGENT = [
  'Composer', 'GateCard', 'ReplyBox', 'AttachList', 'SessionView', 'SplitLayout', 'useSizeClass', 'useWhy', 'can', 'missingPrerequisites', 'ACTIONS', 'isActive',
  'convKey', 'JumpToNewest', 'NeedsBar', 'needsWhat', 'ConvHeader', 'DetailsPanel', 'ConversationView', 'AgentState', 'ShellJobRows', 'shownShellJobs', 'reduceShellJobs', 'createShellJobStops', 'parseJobList', 'parseJobStopReply',
];
const OTHERS = ['EndpointRevNote', 'useEndpointRev', 'SettingGroup', 'SettingSwitch', 'useSettingGroup', 'copyKeyName'];

describe('kit barrel', () => {
  it.each(AGENT)('exports the agent kit name %s', (n) => {
    expect(n in kit, n).toBe(true);
  });
  it.each(OTHERS)('still exports %s, which other pages import', (n) => {
    expect(n in kit, n).toBe(true);
  });
});
