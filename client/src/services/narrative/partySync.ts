export function extractNarrativePartyJoinNames(narrative: string): string[] {
  const names = new Set<string>();
  const patterns = [
    /【\s*队伍更新[:：]\s*([^【\n，。！？!?(（)）]{1,24}?)(?:（[^）]*）)?已加入队伍\s*】/g,
    /(?:^|[\n。！？!?])\s*([^【\n，。！？!?(（)）]{1,24}?)(?:（[^）]*）)?已加入队伍/g,
    /(?:^|[\n。！？!?])\s*([^【\n，。！？!?(（)）]{1,24}?)(?:（[^）]*）)?加入了队伍/g,
  ];

  for (const pattern of patterns) {
    for (const match of narrative.matchAll(pattern)) {
      const candidate = match[1]?.trim().replace(/^[：:\-\s]+|[：:\-\s]+$/g, '');
      if (candidate) {
        names.add(candidate);
      }
    }
  }

  return [...names];
}

export function extractInviteActionTargetNames(actionText: string): string[] {
  const names = new Set<string>();
  const patterns = [
    /邀请\s*([^\s，。！？!?(（)）【】[\]]{1,24}?)\s*(?:加入队伍|入队)/g,
    /让\s*([^\s，。！？!?(（)）【】[\]]{1,24}?)\s*加入队伍/g,
    /招募\s*([^\s，。！？!?(（)）【】[\]]{1,24}?)(?:加入队伍|入队)?/g,
  ];

  for (const pattern of patterns) {
    for (const match of actionText.matchAll(pattern)) {
      const candidate = match[1]?.trim();
      if (candidate) {
        names.add(candidate);
      }
    }
  }

  return [...names];
}

export function narrativeLooksLikePartyInviteAccepted(narrative: string): boolean {
  const acceptedPatterns = [
    /跟定你了/,
    /太好了/,
    /点头/,
    /愿意一起/,
    /愿意同行/,
    /找不到同伴/,
    /一起出发/,
    /跟上你的步伐/,
    /甩到肩上/,
    /加入(?:你们|你的)?(?:的)?队伍/,
    /已加入队伍/,
  ];
  const rejectedPatterns = [
    /拒绝/,
    /婉拒/,
    /摇头/,
    /暂时不能/,
    /不能离开/,
    /抱歉/,
    /不行/,
    /算了/,
    /沉默了片刻后拒绝/,
  ];

  return acceptedPatterns.some((pattern) => pattern.test(narrative))
    && !rejectedPatterns.some((pattern) => pattern.test(narrative));
}

export function resolveNarrativePartyJoinNames(actionText: string, narrative: string): string[] {
  const joinNames = new Set(extractNarrativePartyJoinNames(narrative));
  if (joinNames.size === 0 && narrativeLooksLikePartyInviteAccepted(narrative)) {
    for (const name of extractInviteActionTargetNames(actionText)) {
      joinNames.add(name);
    }
  }
  return [...joinNames];
}