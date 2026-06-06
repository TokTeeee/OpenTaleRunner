import { describe, expect, it } from 'vitest';
import {
  extractNarrativePartyJoinNames,
  narrativeLooksLikePartyInviteAccepted,
  resolveNarrativePartyJoinNames,
} from '../../../src/services/narrative/partySync';

describe('partySync', () => {
  it('extracts explicit party-join updates from narrative text', () => {
    expect(extractNarrativePartyJoinNames('【队伍更新：莉亚已加入队伍】')).toEqual(['莉亚']);
  });

  it('infers the invited npc when the narrative semantically accepts the invitation', () => {
    expect(resolveNarrativePartyJoinNames(
      '邀请莉亚加入队伍',
      '莉亚点点头，太好了，她愿意一起出发。',
    )).toEqual(['莉亚']);
  });

  it('does not infer party joins from rejected invitations', () => {
    expect(narrativeLooksLikePartyInviteAccepted('莉亚沉默了片刻后拒绝了你的邀请。')).toBe(false);
    expect(resolveNarrativePartyJoinNames(
      '邀请莉亚加入队伍',
      '莉亚沉默了片刻后拒绝了你的邀请。',
    )).toEqual([]);
  });
});