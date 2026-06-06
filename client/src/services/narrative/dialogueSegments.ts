export type NarrativeSegment = {
  id: string;
  kind: 'narration' | 'dialogue';
  text: string;
  speakerName?: string;
};

const SPEAKER_PRONOUNS = new Set(['他', '她', '它', '我', '你', '他们', '她们', '它们']);
const PREFERRED_DIALOGUE_QUOTES = new Set(['「', '『']);
const LEGACY_DIALOGUE_QUOTES = new Set(['“', '"']);
const SPEECH_PREFIX_PATTERN = /(?:[:：]|轻声说|低声说|说道|问道|答道|笑道|喊道|开口|嘀咕|呢喃|回应|表示|提醒|说|问|答)\s*$/u;
const SENTENCE_ENDING_PATTERN = /[。！？!?…]$/u;

function shouldTreatQuotedTextAsDialogue(openingQuote: string, beforeContext: string, quotedText: string): boolean {
  if (PREFERRED_DIALOGUE_QUOTES.has(openingQuote)) {
    return true;
  }

  if (!LEGACY_DIALOGUE_QUOTES.has(openingQuote)) {
    return false;
  }

  const prefixWindow = beforeContext.slice(-40);
  if (SPEECH_PREFIX_PATTERN.test(prefixWindow)) {
    return true;
  }

  return beforeContext.trim().length === 0 && SENTENCE_ENDING_PATTERN.test(quotedText.trim());
}

export function guessSpeakerName(context: string, npcNames: string[]): string | undefined {
  const windowText = context.slice(-120);
  let bestName: string | undefined;
  let bestIndex = -1;

  for (const name of npcNames) {
    const index = windowText.lastIndexOf(name);
    if (index > bestIndex) {
      bestIndex = index;
      bestName = name;
    }
  }

  if (bestName) {
    return bestName;
  }

  const match = windowText.match(/([^\s，。！？、“”「」『』:：]{1,16}?)(?:[:：]|轻声说|低声说|说道|问道|答道|笑道|喊道|开口|嘀咕|呢喃|说|问|答)\s*$/u);
  const candidate = match?.[1]?.trim();
  if (!candidate || SPEAKER_PRONOUNS.has(candidate)) {
    return undefined;
  }

  return candidate;
}

export function buildNarrativeSegments(content: string, npcNames: string[]): NarrativeSegment[] {
  const paragraphs = content
    .split(/(?:\r?\n){2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const segments: NarrativeSegment[] = [];
  let segmentIndex = 0;

  for (const paragraph of paragraphs) {
    const quotePattern = /([“"「『])([\s\S]*?)([”"」』])/g;
    let lastIndex = 0;
    let matched = false;

    for (const match of paragraph.matchAll(quotePattern)) {
      const matchIndex = match.index ?? -1;
      if (matchIndex < 0) {
        continue;
      }

      const openingQuote = match[1] ?? '';
      const beforeContext = paragraph.slice(0, matchIndex);
      const dialogueText = match[2]?.trim();
      if (!dialogueText || !shouldTreatQuotedTextAsDialogue(openingQuote, beforeContext, dialogueText)) {
        continue;
      }

      matched = true;
      const before = paragraph.slice(lastIndex, matchIndex).trim();
      if (before) {
        segments.push({ id: `seg-${segmentIndex++}`, kind: 'narration', text: before });
      }

      segments.push({
        id: `seg-${segmentIndex++}`,
        kind: 'dialogue',
        text: dialogueText,
        speakerName: guessSpeakerName(beforeContext, npcNames),
      });

      lastIndex = matchIndex + match[0].length;
    }

    const trailing = paragraph.slice(lastIndex).trim();
    if (trailing) {
      segments.push({ id: `seg-${segmentIndex++}`, kind: 'narration', text: trailing });
    }

    if (!matched && segments.length === 0) {
      segments.push({ id: `seg-${segmentIndex++}`, kind: 'narration', text: paragraph });
    }
  }

  if (segments.length === 0 && content.trim()) {
    segments.push({ id: 'seg-0', kind: 'narration', text: content.trim() });
  }

  return segments;
}