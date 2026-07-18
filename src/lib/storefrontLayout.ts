import type { Service } from "../db.js";

// Discord limits: 25 options per select menu, ~6000 chars of embed content per message.
export const MAX_PER_MESSAGE = 25;
export const CHAR_BUDGET = 5200;

export function serviceChars(s: Service): number {
  return s.name.length + s.price.length + s.description.length + 12;
}

export function chunkServices(services: Service[]): Service[][] {
  const chunks: Service[][] = [];
  let current: Service[] = [];
  let chars = 0;
  for (const s of services) {
    const c = serviceChars(s);
    if (current.length > 0 && (current.length >= MAX_PER_MESSAGE || chars + c > CHAR_BUDGET)) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(s);
    chars += c;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function menuOptionDescription(price: string, description: string): string {
  const d = `${price} · ${description}`;
  return d.length <= 100 ? d : `${d.slice(0, 97)}…`;
}
