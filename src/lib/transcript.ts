export interface TranscriptMessage { author: string; content: string; createdAt: Date; }

export function buildTranscript(messages: TranscriptMessage[]): string {
  if (messages.length === 0) return "(no messages)";
  return messages
    .map(m => `[${m.createdAt.toISOString()}] ${m.author}: ${m.content}`)
    .join("\n");
}
