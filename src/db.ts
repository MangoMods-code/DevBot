import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface GuildConfig {
  guild_id: string;
  welcome_channel: string | null;
  ticket_category: string | null;
  transcript_channel: string | null;
  portfolio_channel: string | null;
  vouch_channel: string | null;
  member_counter_channel: string | null;
  bot_counter_channel: string | null;
  welcome_message: string | null;
  rules_channel: string | null;
  autorole_id: string | null;
  link_action: string | null;
  link_bypass_role: string | null;
  mention_limit: string | null;
}
export const CONFIG_KEYS = [
  "welcome_channel", "ticket_category", "transcript_channel", "portfolio_channel",
  "vouch_channel", "member_counter_channel", "bot_counter_channel", "welcome_message",
  "rules_channel", "autorole_id", "link_action", "link_bypass_role", "mention_limit",
] as const;
export type ConfigKey = (typeof CONFIG_KEYS)[number];

export interface Service { id: number; guild_id: string; name: string; price: string; description: string; }
export interface Ticket {
  id: number; guild_id: string; channel_id: string; user_id: string;
  service_name: string; price: string; status: "open" | "closed";
  opened_at: number; closed_at: number | null; transcript: string | null; vouched: number;
}
export interface PortfolioItem {
  id: number; guild_id: string; name: string; description: string;
  image: string | null; link: string | null; message_id: string | null;
}

export type Db = ReturnType<typeof createDb>;

export function createDb(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id TEXT PRIMARY KEY,
      welcome_channel TEXT, ticket_category TEXT, transcript_channel TEXT,
      portfolio_channel TEXT, vouch_channel TEXT,
      member_counter_channel TEXT, bot_counter_channel TEXT, welcome_message TEXT,
      rules_channel TEXT, autorole_id TEXT, link_action TEXT, link_bypass_role TEXT,
      mention_limit TEXT
    );
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL, name TEXT NOT NULL, price TEXT NOT NULL, description TEXT NOT NULL,
      UNIQUE(guild_id, name)
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, user_id TEXT NOT NULL,
      service_name TEXT NOT NULL, price TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      opened_at INTEGER NOT NULL, closed_at INTEGER, transcript TEXT,
      vouched INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS portfolio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL,
      image TEXT, link TEXT, message_id TEXT,
      UNIQUE(guild_id, name)
    );
    CREATE TABLE IF NOT EXISTS vouches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL, ticket_id INTEGER NOT NULL,
      rating INTEGER NOT NULL, comment TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS storefront_messages (
      guild_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, message_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rules_messages (
      guild_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, message_ids TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS automod_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL, word TEXT NOT NULL, action TEXT NOT NULL,
      UNIQUE(guild_id, word)
    );
  `);
  // Databases created before these settings existed lack the columns; ALTER throws if one already exists.
  for (const col of ["rules_channel", "autorole_id", "link_action", "link_bypass_role", "mention_limit"]) {
    try { sqlite.exec(`ALTER TABLE guild_config ADD COLUMN ${col} TEXT`); } catch { /* column exists */ }
  }

  return {
    raw: sqlite,

    getConfig(guildId: string): GuildConfig {
      sqlite.prepare("INSERT OR IGNORE INTO guild_config (guild_id) VALUES (?)").run(guildId);
      return sqlite.prepare("SELECT * FROM guild_config WHERE guild_id = ?").get(guildId) as GuildConfig;
    },
    setConfig(guildId: string, key: ConfigKey, value: string | null): void {
      if (!CONFIG_KEYS.includes(key)) throw new Error(`Unknown config key: ${key}`);
      this.getConfig(guildId);
      sqlite.prepare(`UPDATE guild_config SET ${key} = ? WHERE guild_id = ?`).run(value, guildId);
    },

    addService(guildId: string, name: string, price: string, description: string): Service {
      const r = sqlite.prepare(
        "INSERT INTO services (guild_id, name, price, description) VALUES (?, ?, ?, ?)"
      ).run(guildId, name, price, description);
      return this.getServiceById(Number(r.lastInsertRowid))!;
    },
    getService(guildId: string, name: string): Service | undefined {
      return sqlite.prepare("SELECT * FROM services WHERE guild_id = ? AND name = ?").get(guildId, name) as Service | undefined;
    },
    getServiceById(id: number): Service | undefined {
      return sqlite.prepare("SELECT * FROM services WHERE id = ?").get(id) as Service | undefined;
    },
    updateService(id: number, price: string, description: string): void {
      sqlite.prepare("UPDATE services SET price = ?, description = ? WHERE id = ?").run(price, description, id);
    },
    removeService(id: number): void {
      sqlite.prepare("DELETE FROM services WHERE id = ?").run(id);
    },
    listServices(guildId: string): Service[] {
      return sqlite.prepare("SELECT * FROM services WHERE guild_id = ? ORDER BY id").all(guildId) as Service[];
    },

    setStorefront(guildId: string, channelId: string, messageIds: string[]): void {
      sqlite.prepare(`
        INSERT INTO storefront_messages (guild_id, channel_id, message_id) VALUES (?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id, message_id = excluded.message_id
      `).run(guildId, channelId, JSON.stringify(messageIds));
    },
    getStorefront(guildId: string): { channel_id: string; message_ids: string[] } | undefined {
      const row = sqlite.prepare("SELECT * FROM storefront_messages WHERE guild_id = ?").get(guildId) as
        { guild_id: string; channel_id: string; message_id: string } | undefined;
      if (!row) return undefined;
      // Rows written before multi-message storefronts hold a bare message id, not JSON.
      let ids: string[];
      try { ids = JSON.parse(row.message_id) as string[]; } catch { ids = [row.message_id]; }
      return { channel_id: row.channel_id, message_ids: ids };
    },

    addKeyword(guildId: string, word: string, action: string): void {
      sqlite.prepare(`
        INSERT INTO automod_keywords (guild_id, word, action) VALUES (?, ?, ?)
        ON CONFLICT(guild_id, word) DO UPDATE SET action = excluded.action
      `).run(guildId, word.toLowerCase(), action);
    },
    removeKeyword(guildId: string, word: string): boolean {
      const r = sqlite.prepare("DELETE FROM automod_keywords WHERE guild_id = ? AND word = ?")
        .run(guildId, word.toLowerCase());
      return r.changes > 0;
    },
    listKeywords(guildId: string): { word: string; action: string }[] {
      return sqlite.prepare("SELECT word, action FROM automod_keywords WHERE guild_id = ? ORDER BY word")
        .all(guildId) as { word: string; action: string }[];
    },

    setRulesMessages(guildId: string, channelId: string, messageIds: string[]): void {
      sqlite.prepare(`
        INSERT INTO rules_messages (guild_id, channel_id, message_ids) VALUES (?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id, message_ids = excluded.message_ids
      `).run(guildId, channelId, JSON.stringify(messageIds));
    },
    getRulesMessages(guildId: string): { channel_id: string; message_ids: string[] } | undefined {
      const row = sqlite.prepare("SELECT * FROM rules_messages WHERE guild_id = ?").get(guildId) as
        { guild_id: string; channel_id: string; message_ids: string } | undefined;
      if (!row) return undefined;
      return { channel_id: row.channel_id, message_ids: JSON.parse(row.message_ids) as string[] };
    },

    openTicket(guildId: string, channelId: string, userId: string, serviceName: string, price: string): Ticket {
      const r = sqlite.prepare(`
        INSERT INTO tickets (guild_id, channel_id, user_id, service_name, price, opened_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(guildId, channelId, userId, serviceName, price, Date.now());
      return sqlite.prepare("SELECT * FROM tickets WHERE id = ?").get(Number(r.lastInsertRowid)) as Ticket;
    },
    getOpenTicketByUser(guildId: string, userId: string): Ticket | undefined {
      return sqlite.prepare(
        "SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'"
      ).get(guildId, userId) as Ticket | undefined;
    },
    getTicketByChannel(channelId: string): Ticket | undefined {
      return sqlite.prepare("SELECT * FROM tickets WHERE channel_id = ?").get(channelId) as Ticket | undefined;
    },
    closeTicket(id: number, transcript: string): void {
      sqlite.prepare(
        "UPDATE tickets SET status = 'closed', closed_at = ?, transcript = ? WHERE id = ?"
      ).run(Date.now(), transcript, id);
    },

    getUnvouchedClosedTicket(guildId: string, userId: string): Ticket | undefined {
      return sqlite.prepare(
        "SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'closed' AND vouched = 0 ORDER BY closed_at LIMIT 1"
      ).get(guildId, userId) as Ticket | undefined;
    },
    markVouched(ticketId: number): void {
      sqlite.prepare("UPDATE tickets SET vouched = 1 WHERE id = ?").run(ticketId);
    },
    addVouch(guildId: string, userId: string, ticketId: number, rating: number, comment: string): void {
      sqlite.prepare(
        "INSERT INTO vouches (guild_id, user_id, ticket_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(guildId, userId, ticketId, rating, comment, Date.now());
    },

    addPortfolio(guildId: string, name: string, description: string, image: string | null, link: string | null): PortfolioItem {
      const r = sqlite.prepare(
        "INSERT INTO portfolio (guild_id, name, description, image, link) VALUES (?, ?, ?, ?, ?)"
      ).run(guildId, name, description, image, link);
      return sqlite.prepare("SELECT * FROM portfolio WHERE id = ?").get(Number(r.lastInsertRowid)) as PortfolioItem;
    },
    getPortfolioItem(guildId: string, name: string): PortfolioItem | undefined {
      return sqlite.prepare("SELECT * FROM portfolio WHERE guild_id = ? AND name = ?").get(guildId, name) as PortfolioItem | undefined;
    },
    setPortfolioMessage(id: number, messageId: string): void {
      sqlite.prepare("UPDATE portfolio SET message_id = ? WHERE id = ?").run(messageId, id);
    },
    removePortfolio(id: number): void {
      sqlite.prepare("DELETE FROM portfolio WHERE id = ?").run(id);
    },
    listPortfolio(guildId: string): PortfolioItem[] {
      return sqlite.prepare("SELECT * FROM portfolio WHERE guild_id = ? ORDER BY id").all(guildId) as PortfolioItem[];
    },
  };
}
