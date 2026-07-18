export type AutomodAction = "delete" | "kick" | "ban";
export interface KeywordRule { word: string; action: AutomodAction; }

export function matchKeyword(content: string, rules: KeywordRule[]): KeywordRule | undefined {
  const lower = content.toLowerCase();
  return rules.find(r => lower.includes(r.word.toLowerCase()));
}

const LINK_RE = /(https?:\/\/\S+|www\.\S+|discord\.(gg|com\/invite)\/\S+)/i;

export function hasLink(content: string): boolean {
  return LINK_RE.test(content);
}

// @everyone/@here weigh 5 because one of them pings the whole server.
export function mentionScore(userMentions: number, roleMentions: number, everyone: boolean): number {
  return userMentions + roleMentions + (everyone ? 5 : 0);
}
