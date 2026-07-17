# DevDesk Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A TypeScript discord.js v14 bot with storefront + order tickets, portfolio, vouches, welcome messages, and throttled member/bot counter channels, backed by SQLite, deployable to Railway.

**Architecture:** Single Node process. `index.ts` bootstraps the client and auto-loads one-file-per-command (`src/commands/`) and one-file-per-button (`src/components/`) modules via `registry.ts`. All state lives in SQLite (`better-sqlite3`) behind typed query helpers in `db.ts`; pure logic (throttle, transcripts, templates) lives in `src/lib/` and is unit-tested with vitest.

**Tech Stack:** TypeScript (strict, ESM/NodeNext), discord.js ^14, better-sqlite3 ^11, vitest ^2, tsx ^4 (dev), Railway + Nixpacks.

## Global Constraints

- Node 20+, ESM (`"type": "module"`), strict TypeScript.
- DB path from `DB_PATH` env var, default `./data/devdesk.db`; `:memory:` in tests.
- Only required env var: `DISCORD_TOKEN`. Optional: `GUILD_ID` (guild-scoped command registration for instant dev iteration), `DB_PATH`.
- Admin = `ManageGuild` permission via `setDefaultMemberPermissions`.
- Every interaction dispatch wrapped in try/catch → ephemeral "Something went wrong." — process never crashes on a failed interaction.
- Channel renames throttled: skip if value unchanged, min 5 minutes between renames per channel.
- Commit after every task.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`

**Interfaces:**
- Produces: `npm run build` (tsc → dist), `npm test` (vitest run), `npm run dev` (tsx watch), `npm start` (node dist/index.js)

- [ ] **Step 1: Write package.json**

```json
{
  "name": "devdesk-bot",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "better-sqlite3": "^11.10.0",
    "discord.js": "^14.16.3"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.10.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 3: Write .gitignore and .env.example**

`.gitignore`:
```
node_modules/
dist/
data/
.env
```

`.env.example`:
```
DISCORD_TOKEN=your-bot-token
GUILD_ID=optional-dev-guild-id
DB_PATH=./data/devdesk.db
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: node_modules created, lockfile written, no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore .env.example
git commit -m "chore: scaffold TypeScript project"
```

---

### Task 2: Database layer

**Files:**
- Create: `src/db.ts`, `src/state.ts`
- Test: `src/db.test.ts`

**Interfaces:**
- Produces: `createDb(path: string): Db` and singleton `db` (from `state.ts`). `Db` methods used by later tasks:
  - `getConfig(guildId): GuildConfig` (auto-creates row with nulls)
  - `setConfig(guildId, key: ConfigKey, value: string | null): void`
  - `addService(guildId, name, price, description): Service` / `getService(guildId, name)` / `getServiceById(id)` / `updateService(id, price, description)` / `removeService(id)` / `listServices(guildId): Service[]`
  - `setStorefront(guildId, channelId, messageId)` / `getStorefront(guildId): { channel_id, message_id } | undefined`
  - `openTicket(guildId, channelId, userId, serviceName, price): Ticket` / `getOpenTicketByUser(guildId, userId)` / `getTicketByChannel(channelId)` / `closeTicket(id, transcript)`
  - `getUnvouchedClosedTicket(guildId, userId): Ticket | undefined` / `markVouched(ticketId)` / `addVouch(guildId, userId, ticketId, rating, comment)`
  - `addPortfolio(guildId, name, description, image, link): PortfolioItem` / `getPortfolioItem(guildId, name)` / `setPortfolioMessage(id, messageId)` / `removePortfolio(id)` / `listPortfolio(guildId): PortfolioItem[]`

- [ ] **Step 1: Write failing tests** (`src/db.test.ts`)

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "./db.js";

let db: Db;
beforeEach(() => { db = createDb(":memory:"); });

describe("guild config", () => {
  it("returns a default row with null settings", () => {
    const cfg = db.getConfig("g1");
    expect(cfg.guild_id).toBe("g1");
    expect(cfg.ticket_category).toBeNull();
  });
  it("sets and reads back a setting", () => {
    db.setConfig("g1", "vouch_channel", "c9");
    expect(db.getConfig("g1").vouch_channel).toBe("c9");
  });
});

describe("services", () => {
  it("adds and lists services", () => {
    db.addService("g1", "Discord Bot", "$50+", "Custom bots");
    db.addService("g1", "Website", "$100+", "Full site");
    expect(db.listServices("g1").map(s => s.name)).toEqual(["Discord Bot", "Website"]);
  });
  it("rejects duplicate names per guild", () => {
    db.addService("g1", "Bot", "$50", "d");
    expect(() => db.addService("g1", "Bot", "$60", "d")).toThrow();
  });
  it("updates and removes", () => {
    const s = db.addService("g1", "Bot", "$50", "d");
    db.updateService(s.id, "$75", "better");
    expect(db.getService("g1", "Bot")?.price).toBe("$75");
    db.removeService(s.id);
    expect(db.getService("g1", "Bot")).toBeUndefined();
  });
});

describe("tickets and vouches", () => {
  it("opens one ticket per user", () => {
    db.openTicket("g1", "ch1", "u1", "Bot", "$50");
    expect(db.getOpenTicketByUser("g1", "u1")?.channel_id).toBe("ch1");
  });
  it("close makes ticket vouch-eligible exactly once", () => {
    const t = db.openTicket("g1", "ch1", "u1", "Bot", "$50");
    expect(db.getUnvouchedClosedTicket("g1", "u1")).toBeUndefined();
    db.closeTicket(t.id, "transcript text");
    const closed = db.getUnvouchedClosedTicket("g1", "u1");
    expect(closed?.id).toBe(t.id);
    expect(db.getTicketByChannel("ch1")?.transcript).toBe("transcript text");
    db.addVouch("g1", "u1", t.id, 5, "great");
    db.markVouched(t.id);
    expect(db.getUnvouchedClosedTicket("g1", "u1")).toBeUndefined();
  });
});

describe("portfolio and storefront", () => {
  it("portfolio crud with message id", () => {
    const p = db.addPortfolio("g1", "AJD Site", "mechanic site", null, "https://x.com");
    db.setPortfolioMessage(p.id, "m1");
    expect(db.getPortfolioItem("g1", "AJD Site")?.message_id).toBe("m1");
    db.removePortfolio(p.id);
    expect(db.listPortfolio("g1")).toEqual([]);
  });
  it("storefront upsert", () => {
    db.setStorefront("g1", "c1", "m1");
    db.setStorefront("g1", "c2", "m2");
    expect(db.getStorefront("g1")).toMatchObject({ channel_id: "c2", message_id: "m2" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/db.test.ts`
Expected: FAIL — cannot resolve `./db.js`.

- [ ] **Step 3: Write src/db.ts**

```ts
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
}
export const CONFIG_KEYS = [
  "welcome_channel", "ticket_category", "transcript_channel", "portfolio_channel",
  "vouch_channel", "member_counter_channel", "bot_counter_channel", "welcome_message",
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
      member_counter_channel TEXT, bot_counter_channel TEXT, welcome_message TEXT
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
  `);

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

    setStorefront(guildId: string, channelId: string, messageId: string): void {
      sqlite.prepare(`
        INSERT INTO storefront_messages (guild_id, channel_id, message_id) VALUES (?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id, message_id = excluded.message_id
      `).run(guildId, channelId, messageId);
    },
    getStorefront(guildId: string): { guild_id: string; channel_id: string; message_id: string } | undefined {
      return sqlite.prepare("SELECT * FROM storefront_messages WHERE guild_id = ?").get(guildId) as
        { guild_id: string; channel_id: string; message_id: string } | undefined;
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
```

- [ ] **Step 4: Write src/state.ts** (runtime singleton; tests never import this)

```ts
import { createDb } from "./db.js";

export const db = createDb(process.env.DB_PATH ?? "./data/devdesk.db");
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/db.test.ts`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db.ts src/db.test.ts src/state.ts
git commit -m "feat: SQLite database layer with typed queries"
```

---

### Task 3: Pure helpers — counter throttle, transcript builder, welcome template

**Files:**
- Create: `src/lib/counters.ts`, `src/lib/transcript.ts`, `src/lib/welcome.ts`
- Test: `src/lib/counters.test.ts`, `src/lib/transcript.test.ts`, `src/lib/welcome.test.ts`

**Interfaces:**
- Produces:
  - `MIN_RENAME_INTERVAL_MS: number`; `shouldRename(state: CounterState, newValue: number, now: number): boolean`; `interface CounterState { lastRename: number; lastValue: number | null }`
  - `buildTranscript(messages: TranscriptMessage[]): string`; `interface TranscriptMessage { author: string; content: string; createdAt: Date }`
  - `renderWelcome(template: string, mention: string): string`; `DEFAULT_WELCOME: string`

- [ ] **Step 1: Write failing tests**

`src/lib/counters.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { shouldRename, MIN_RENAME_INTERVAL_MS, type CounterState } from "./counters.js";

describe("shouldRename", () => {
  const base: CounterState = { lastRename: 1_000_000, lastValue: 10 };
  it("skips when value unchanged even after interval", () => {
    expect(shouldRename(base, 10, base.lastRename + MIN_RENAME_INTERVAL_MS * 2)).toBe(false);
  });
  it("skips when interval not elapsed", () => {
    expect(shouldRename(base, 11, base.lastRename + MIN_RENAME_INTERVAL_MS - 1)).toBe(false);
  });
  it("renames when value changed and interval elapsed", () => {
    expect(shouldRename(base, 11, base.lastRename + MIN_RENAME_INTERVAL_MS)).toBe(true);
  });
  it("renames immediately when never renamed before", () => {
    expect(shouldRename({ lastRename: 0, lastValue: null }, 5, 100)).toBe(true);
  });
});
```

`src/lib/transcript.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildTranscript } from "./transcript.js";

describe("buildTranscript", () => {
  it("formats oldest-first with ISO timestamps", () => {
    const out = buildTranscript([
      { author: "mango", content: "hi", createdAt: new Date("2026-07-17T10:00:00Z") },
      { author: "client", content: "hello", createdAt: new Date("2026-07-17T10:01:00Z") },
    ]);
    expect(out).toBe(
      "[2026-07-17T10:00:00.000Z] mango: hi\n[2026-07-17T10:01:00.000Z] client: hello"
    );
  });
  it("handles empty message list", () => {
    expect(buildTranscript([])).toBe("(no messages)");
  });
});
```

`src/lib/welcome.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { renderWelcome, DEFAULT_WELCOME } from "./welcome.js";

describe("renderWelcome", () => {
  it("replaces every {user} placeholder", () => {
    expect(renderWelcome("hey {user}, {user}!", "<@1>")).toBe("hey <@1>, <@1>!");
  });
  it("default template contains the placeholder", () => {
    expect(DEFAULT_WELCOME).toContain("{user}");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/lib/counters.ts`:
```ts
export interface CounterState { lastRename: number; lastValue: number | null; }

export const MIN_RENAME_INTERVAL_MS = 5 * 60 * 1000;

export function shouldRename(state: CounterState, newValue: number, now: number): boolean {
  if (state.lastValue === newValue) return false;
  return now - state.lastRename >= MIN_RENAME_INTERVAL_MS || state.lastValue === null;
}
```

`src/lib/transcript.ts`:
```ts
export interface TranscriptMessage { author: string; content: string; createdAt: Date; }

export function buildTranscript(messages: TranscriptMessage[]): string {
  if (messages.length === 0) return "(no messages)";
  return messages
    .map(m => `[${m.createdAt.toISOString()}] ${m.author}: ${m.content}`)
    .join("\n");
}
```

`src/lib/welcome.ts`:
```ts
export const DEFAULT_WELCOME = "Welcome to the server, {user}! Check out the storefront to see what we offer.";

export function renderWelcome(template: string, mention: string): string {
  return template.replaceAll("{user}", mention);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib
git commit -m "feat: counter throttle, transcript builder, welcome template helpers"
```

---

### Task 4: Registry, client bootstrap, /ping

**Files:**
- Create: `src/registry.ts`, `src/index.ts`, `src/commands/ping.ts`

**Interfaces:**
- Produces:
  - `interface Command { data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder; execute(i: ChatInputCommandInteraction): Promise<void>; autocomplete?(i: AutocompleteInteraction): Promise<void>; }`
  - `interface Component { prefix: string; execute(i: ButtonInteraction): Promise<void>; }`
  - `loadCommands(): Promise<Map<string, Command>>`, `loadComponents(): Promise<Map<string, Component>>` — every later command/component task just drops a default-exporting file into the right folder.

- [ ] **Step 1: Write src/registry.ts**

```ts
import { readdirSync } from "node:fs";
import type {
  AutocompleteInteraction, ButtonInteraction, ChatInputCommandInteraction,
  SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}

export interface Component {
  prefix: string;
  execute(interaction: ButtonInteraction): Promise<void>;
}

async function loadDir<T>(dir: URL): Promise<T[]> {
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return [];
  }
  const mods: T[] = [];
  for (const file of files) {
    if (!/\.(js|ts)$/.test(file) || file.endsWith(".d.ts") || file.includes(".test.")) continue;
    const mod = await import(new URL(file, dir).href);
    mods.push(mod.default as T);
  }
  return mods;
}

export async function loadCommands(): Promise<Map<string, Command>> {
  const commands = await loadDir<Command>(new URL("./commands/", import.meta.url));
  return new Map(commands.map(c => [c.data.name, c]));
}

export async function loadComponents(): Promise<Map<string, Component>> {
  const components = await loadDir<Component>(new URL("./components/", import.meta.url));
  return new Map(components.map(c => [c.prefix, c]));
}
```

- [ ] **Step 2: Write src/commands/ping.ts**

```ts
import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { Command } from "../registry.js";

const started = Date.now();

const ping: Command = {
  data: new SlashCommandBuilder().setName("ping").setDescription("Bot latency and uptime"),
  async execute(interaction: ChatInputCommandInteraction) {
    const uptimeMin = Math.floor((Date.now() - started) / 60000);
    await interaction.reply({
      content: `Pong! Latency: ${interaction.client.ws.ping}ms · Uptime: ${uptimeMin}m`,
    });
  },
};

export default ping;
```

- [ ] **Step 3: Write src/index.ts**

```ts
import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { loadCommands, loadComponents } from "./registry.js";

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN is not set");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const commands = await loadCommands();
const components = await loadComponents();

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  const data = [...commands.values()].map(cmd => cmd.data.toJSON());
  const guildId = process.env.GUILD_ID;
  if (guildId) {
    const guild = await c.guilds.fetch(guildId);
    await guild.commands.set(data);
    console.log(`Registered ${data.length} guild commands in ${guild.name}`);
  } else {
    await c.application.commands.set(data);
    console.log(`Registered ${data.length} global commands`);
  }
  for (const guild of c.guilds.cache.values()) {
    await guild.members.fetch().catch(err => console.error(`member fetch failed for ${guild.id}:`, err));
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await commands.get(interaction.commandName)?.execute(interaction);
    } else if (interaction.isAutocomplete()) {
      await commands.get(interaction.commandName)?.autocomplete?.(interaction);
    } else if (interaction.isButton()) {
      await components.get(interaction.customId.split(":")[0])?.execute(interaction);
    }
  } catch (err) {
    console.error("interaction error:", err);
    if (interaction.isRepliable()) {
      const payload = { content: "Something went wrong. Try again or ping an admin.", flags: MessageFlags.Ephemeral } as const;
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
    }
  }
});

client.login(token);
```

- [ ] **Step 4: Build to verify it compiles**

Run: `npm run build`
Expected: success, `dist/` produced.

- [ ] **Step 5: Commit**

```bash
git add src/registry.ts src/index.ts src/commands/ping.ts
git commit -m "feat: client bootstrap with command/component auto-loading and /ping"
```

---

### Task 5: /config command

**Files:**
- Create: `src/commands/config.ts`

**Interfaces:**
- Consumes: `db.getConfig`, `db.setConfig`, `CONFIG_KEYS`, `ConfigKey` from Task 2.
- Produces: `/config set setting:<choice> channel:<channel>`, `/config welcome-message message:<text>`, `/config view`. Channel settings named by ConfigKey.

- [ ] **Step 1: Write src/commands/config.ts**

```ts
import {
  ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../registry.js";
import { db } from "../state.js";
import type { ConfigKey } from "../db.js";

const CHANNEL_SETTINGS: { key: ConfigKey; label: string }[] = [
  { key: "welcome_channel", label: "Welcome channel" },
  { key: "ticket_category", label: "Ticket category" },
  { key: "transcript_channel", label: "Transcript channel" },
  { key: "portfolio_channel", label: "Portfolio channel" },
  { key: "vouch_channel", label: "Vouch channel" },
  { key: "member_counter_channel", label: "Member counter voice channel" },
  { key: "bot_counter_channel", label: "Bot counter voice channel" },
];

const config: Command = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configure DevDesk channels and messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub
      .setName("set")
      .setDescription("Point a DevDesk feature at a channel")
      .addStringOption(o => o.setName("setting").setDescription("Which setting").setRequired(true)
        .addChoices(...CHANNEL_SETTINGS.map(s => ({ name: s.label, value: s.key }))))
      .addChannelOption(o => o.setName("channel").setDescription("The channel").setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildCategory)))
    .addSubcommand(sub => sub
      .setName("welcome-message")
      .setDescription("Set the welcome message ({user} = new member)")
      .addStringOption(o => o.setName("message").setDescription("Template, {user} mentions the member").setRequired(true)))
    .addSubcommand(sub => sub.setName("view").setDescription("Show current configuration")),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) return;
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === "set") {
      const key = interaction.options.getString("setting", true) as ConfigKey;
      const channel = interaction.options.getChannel("channel", true);
      db.setConfig(guildId, key, channel.id);
      await interaction.reply({ content: `Set **${key}** to ${channel}`, flags: MessageFlags.Ephemeral });
    } else if (sub === "welcome-message") {
      const message = interaction.options.getString("message", true);
      db.setConfig(guildId, "welcome_message", message);
      await interaction.reply({ content: "Welcome message updated.", flags: MessageFlags.Ephemeral });
    } else {
      const cfg = db.getConfig(guildId);
      const lines = CHANNEL_SETTINGS.map(s => {
        const v = cfg[s.key];
        return `**${s.label}:** ${v ? `<#${v}>` : "*not set*"}`;
      });
      lines.push(`**Welcome message:** ${cfg.welcome_message ?? "*default*"}`);
      await interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
    }
  },
};

export default config;
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/commands/config.ts
git commit -m "feat: /config command for channel and welcome settings"
```

---

### Task 6: /service command with autocomplete

**Files:**
- Create: `src/commands/service.ts`, `src/lib/autocomplete.ts`

**Interfaces:**
- Consumes: `db.addService/getService/updateService/removeService/listServices`.
- Produces: `/service add|edit|remove|list`; helper `serviceNameAutocomplete(interaction)` reused by `/order` in Task 8. Calls `refreshStorefront` (Task 7) if present — to avoid a forward dependency, Task 6 ships without the refresh call; Task 7 adds it.

- [ ] **Step 1: Write src/lib/autocomplete.ts**

```ts
import type { AutocompleteInteraction } from "discord.js";
import { db } from "../state.js";

export async function serviceNameAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.inGuild()) return;
  const q = interaction.options.getFocused().toLowerCase();
  const names = db.listServices(interaction.guildId)
    .map(s => s.name)
    .filter(n => n.toLowerCase().includes(q))
    .slice(0, 25);
  await interaction.respond(names.map(n => ({ name: n, value: n })));
}
```

- [ ] **Step 2: Write src/commands/service.ts**

```ts
import {
  MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../registry.js";
import { db } from "../state.js";
import { serviceNameAutocomplete } from "../lib/autocomplete.js";

const service: Command = {
  data: new SlashCommandBuilder()
    .setName("service")
    .setDescription("Manage the services you sell")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub.setName("add").setDescription("Add a service")
      .addStringOption(o => o.setName("name").setDescription("Service name").setRequired(true).setMaxLength(80))
      .addStringOption(o => o.setName("price").setDescription("Price, e.g. $50+").setRequired(true).setMaxLength(30))
      .addStringOption(o => o.setName("description").setDescription("What the client gets").setRequired(true).setMaxLength(200)))
    .addSubcommand(sub => sub.setName("edit").setDescription("Edit a service's price/description")
      .addStringOption(o => o.setName("name").setDescription("Service to edit").setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName("price").setDescription("New price").setMaxLength(30))
      .addStringOption(o => o.setName("description").setDescription("New description").setMaxLength(200)))
    .addSubcommand(sub => sub.setName("remove").setDescription("Remove a service")
      .addStringOption(o => o.setName("name").setDescription("Service to remove").setRequired(true).setAutocomplete(true)))
    .addSubcommand(sub => sub.setName("list").setDescription("List all services")),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) return;
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === "add") {
      const name = interaction.options.getString("name", true);
      if (db.getService(guildId, name)) {
        await interaction.reply({ content: `A service named **${name}** already exists.`, flags: MessageFlags.Ephemeral });
        return;
      }
      db.addService(guildId, name,
        interaction.options.getString("price", true),
        interaction.options.getString("description", true));
      await interaction.reply({ content: `Added service **${name}**.`, flags: MessageFlags.Ephemeral });
    } else if (sub === "edit") {
      const name = interaction.options.getString("name", true);
      const existing = db.getService(guildId, name);
      if (!existing) {
        await interaction.reply({ content: `No service named **${name}**.`, flags: MessageFlags.Ephemeral });
        return;
      }
      db.updateService(existing.id,
        interaction.options.getString("price") ?? existing.price,
        interaction.options.getString("description") ?? existing.description);
      await interaction.reply({ content: `Updated **${name}**.`, flags: MessageFlags.Ephemeral });
    } else if (sub === "remove") {
      const name = interaction.options.getString("name", true);
      const existing = db.getService(guildId, name);
      if (!existing) {
        await interaction.reply({ content: `No service named **${name}**.`, flags: MessageFlags.Ephemeral });
        return;
      }
      db.removeService(existing.id);
      await interaction.reply({ content: `Removed **${name}**.`, flags: MessageFlags.Ephemeral });
    } else {
      const services = db.listServices(guildId);
      const body = services.length
        ? services.map(s => `**${s.name}** — ${s.price}\n${s.description}`).join("\n\n")
        : "No services yet. Add one with `/service add`.";
      await interaction.reply({ content: body, flags: MessageFlags.Ephemeral });
    }
  },

  autocomplete: serviceNameAutocomplete,
};

export default service;
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/commands/service.ts src/lib/autocomplete.ts
git commit -m "feat: /service management commands with autocomplete"
```

---

### Task 7: Storefront — /setup storefront + auto-refresh on service changes

**Files:**
- Create: `src/lib/storefront.ts`, `src/commands/setup.ts`
- Modify: `src/commands/service.ts` (call refresh after add/edit/remove)

**Interfaces:**
- Consumes: `db.listServices/setStorefront/getStorefront`, Task 6's service command.
- Produces: `refreshStorefront(guild: Guild): Promise<void>` (edits stored message in place; no-op if none), `postStorefront(guild: Guild, channel: GuildTextBasedChannel): Promise<void>`; `/setup storefront channel:<text channel>`. Order buttons use custom ID `order:<serviceId>`. Task 13 adds a `counters` subcommand to this same `setup.ts` file.

- [ ] **Step 1: Write src/lib/storefront.ts**

```ts
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  type Guild, type GuildTextBasedChannel,
} from "discord.js";
import { db } from "../state.js";
import type { Service } from "../db.js";

const MAX_BUTTONS = 25; // 5 rows x 5 buttons

function buildStorefront(services: Service[]) {
  const embed = new EmbedBuilder()
    .setTitle("🛠️ Services")
    .setColor(0x57f287)
    .setDescription(
      services.length
        ? services.map(s => `**${s.name}** — \`${s.price}\`\n${s.description}`).join("\n\n")
        : "No services listed yet."
    )
    .setFooter({ text: "Click a button below to open an order ticket" });

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < Math.min(services.length, MAX_BUTTONS); i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      services.slice(i, i + 5).map(s =>
        new ButtonBuilder()
          .setCustomId(`order:${s.id}`)
          .setLabel(`Order: ${s.name}`.slice(0, 80))
          .setStyle(ButtonStyle.Primary)
      )
    ));
  }
  return { embeds: [embed], components: rows };
}

export async function postStorefront(guild: Guild, channel: GuildTextBasedChannel): Promise<void> {
  const existing = db.getStorefront(guild.id);
  if (existing) {
    const oldChannel = await guild.channels.fetch(existing.channel_id).catch(() => null);
    if (oldChannel?.isTextBased()) {
      await oldChannel.messages.delete(existing.message_id).catch(() => {});
    }
  }
  const msg = await channel.send(buildStorefront(db.listServices(guild.id)));
  db.setStorefront(guild.id, channel.id, msg.id);
}

export async function refreshStorefront(guild: Guild): Promise<void> {
  const stored = db.getStorefront(guild.id);
  if (!stored) return;
  const channel = await guild.channels.fetch(stored.channel_id).catch(() => null);
  if (!channel?.isTextBased()) return;
  const msg = await channel.messages.fetch(stored.message_id).catch(() => null);
  if (!msg) return;
  await msg.edit(buildStorefront(db.listServices(guild.id)));
}
```

- [ ] **Step 2: Write src/commands/setup.ts** (storefront subcommand only; counters added in Task 13)

```ts
import {
  ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
  type ChatInputCommandInteraction, type GuildTextBasedChannel,
} from "discord.js";
import type { Command } from "../registry.js";
import { postStorefront } from "../lib/storefront.js";

const setup: Command = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Set up DevDesk fixtures")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub.setName("storefront")
      .setDescription("Post (or move) the storefront embed")
      .addChannelOption(o => o.setName("channel").setDescription("Channel for the storefront")
        .setRequired(true).addChannelTypes(ChannelType.GuildText))),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) return;
    const sub = interaction.options.getSubcommand();

    if (sub === "storefront") {
      const channel = interaction.options.getChannel("channel", true) as GuildTextBasedChannel;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await postStorefront(interaction.guild, channel);
      await interaction.editReply(`Storefront posted in ${channel}. It auto-updates when you change services.`);
    }
  },
};

export default setup;
```

- [ ] **Step 3: Modify src/commands/service.ts** — after each successful add/edit/remove reply, refresh:

Add import at top:
```ts
import { refreshStorefront } from "../lib/storefront.js";
```

At the end of each of the `add`, `edit`, and `remove` branches (after the `interaction.reply` call), add:
```ts
if (interaction.guild) await refreshStorefront(interaction.guild);
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storefront.ts src/commands/setup.ts src/commands/service.ts
git commit -m "feat: storefront embed with order buttons and auto-refresh"
```

---

### Task 8: Ticket creation — order button and /order command

**Files:**
- Create: `src/lib/tickets.ts`, `src/components/order.ts`, `src/commands/order.ts`

**Interfaces:**
- Consumes: `db.getConfig/getOpenTicketByUser/openTicket/getServiceById/getService`, `serviceNameAutocomplete`.
- Produces: `openTicketFor(interaction: ChatInputCommandInteraction | ButtonInteraction, service: Service): Promise<void>` — creates channel, DB row, opening embed with `closeticket` button, replies ephemerally. Close button custom ID: `closeticket` (no suffix; channel identifies the ticket).

- [ ] **Step 1: Write src/lib/tickets.ts**

```ts
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder,
  MessageFlags, PermissionFlagsBits,
  type ButtonInteraction, type ChatInputCommandInteraction,
} from "discord.js";
import { db } from "../state.js";
import type { Service } from "../db.js";

export async function openTicketFor(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  service: Service,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const cfg = db.getConfig(guild.id);
  if (!cfg.ticket_category) {
    await interaction.reply({
      content: "Tickets aren't set up yet — an admin needs to run `/config set setting:Ticket category`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const existing = db.getOpenTicketByUser(guild.id, interaction.user.id);
  if (existing) {
    await interaction.reply({
      content: `You already have an open ticket: <#${existing.channel_id}>`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "user";
  const channel = await guild.channels.create({
    name: `ticket-${safeName}`,
    type: ChannelType.GuildText,
    parent: cfg.ticket_category,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: guild.members.me!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
    ],
  });

  db.openTicket(guild.id, channel.id, interaction.user.id, service.name, service.price);

  const embed = new EmbedBuilder()
    .setTitle(`Order: ${service.name}`)
    .setColor(0x57f287)
    .addFields(
      { name: "Service", value: service.name, inline: true },
      { name: "Price", value: service.price, inline: true },
      { name: "Client", value: `<@${interaction.user.id}>`, inline: true },
    )
    .setDescription("Describe what you need — requirements, deadline, budget. Payment is arranged manually in this channel.")
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("closeticket").setLabel("Close Ticket").setStyle(ButtonStyle.Danger),
  );

  await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });
  await interaction.editReply(`Ticket opened: ${channel}`);
}
```

- [ ] **Step 2: Write src/components/order.ts**

```ts
import { MessageFlags, type ButtonInteraction } from "discord.js";
import type { Component } from "../registry.js";
import { db } from "../state.js";
import { openTicketFor } from "../lib/tickets.js";

const order: Component = {
  prefix: "order",
  async execute(interaction: ButtonInteraction) {
    const serviceId = Number(interaction.customId.split(":")[1]);
    const service = db.getServiceById(serviceId);
    if (!service) {
      await interaction.reply({ content: "That service no longer exists.", flags: MessageFlags.Ephemeral });
      return;
    }
    await openTicketFor(interaction, service);
  },
};

export default order;
```

- [ ] **Step 3: Write src/commands/order.ts**

```ts
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { Command } from "../registry.js";
import { db } from "../state.js";
import { openTicketFor } from "../lib/tickets.js";
import { serviceNameAutocomplete } from "../lib/autocomplete.js";

const order: Command = {
  data: new SlashCommandBuilder()
    .setName("order")
    .setDescription("Open an order ticket for a service")
    .addStringOption(o => o.setName("service").setDescription("The service you want").setRequired(true).setAutocomplete(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) return;
    const name = interaction.options.getString("service", true);
    const service = db.getService(interaction.guildId, name);
    if (!service) {
      await interaction.reply({ content: `No service named **${name}** — pick one from the autocomplete list.`, flags: MessageFlags.Ephemeral });
      return;
    }
    await openTicketFor(interaction, service);
  },

  autocomplete: serviceNameAutocomplete,
};

export default order;
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tickets.ts src/components/order.ts src/commands/order.ts
git commit -m "feat: order tickets via storefront button or /order"
```

---

### Task 9: Ticket close — transcript + channel deletion

**Files:**
- Create: `src/components/closeticket.ts`

**Interfaces:**
- Consumes: `db.getTicketByChannel/closeTicket/getConfig`, `buildTranscript` (Task 3).
- Produces: `closeticket` button handler. Fetches full message history (paginated, oldest-first), stores transcript in DB, posts summary + `.txt` attachment to transcript channel if configured, deletes the channel.

- [ ] **Step 1: Write src/components/closeticket.ts**

```ts
import {
  AttachmentBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits,
  type ButtonInteraction, type Message, type TextChannel,
} from "discord.js";
import type { Component } from "../registry.js";
import { db } from "../state.js";
import { buildTranscript, type TranscriptMessage } from "../lib/transcript.js";

async function fetchAllMessages(channel: TextChannel): Promise<TranscriptMessage[]> {
  const all: Message[] = [];
  let before: string | undefined;
  for (;;) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;
    all.push(...batch.values());
    before = batch.last()!.id;
    if (batch.size < 100) break;
  }
  return all
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map(m => ({ author: m.author.tag, content: m.content || "(embed/attachment)", createdAt: m.createdAt }));
}

const closeticket: Component = {
  prefix: "closeticket",
  async execute(interaction: ButtonInteraction) {
    const guild = interaction.guild;
    if (!guild || !interaction.channel) return;

    const ticket = db.getTicketByChannel(interaction.channel.id);
    if (!ticket || ticket.status === "closed") {
      await interaction.reply({ content: "This channel isn't an open ticket.", flags: MessageFlags.Ephemeral });
      return;
    }
    const isOwner = interaction.user.id === ticket.user_id;
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
    if (!isOwner && !isAdmin) {
      await interaction.reply({ content: "Only the ticket owner or an admin can close this.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply("Closing ticket and saving transcript…");

    const messages = await fetchAllMessages(interaction.channel as TextChannel);
    const transcript = buildTranscript(messages);
    db.closeTicket(ticket.id, transcript);

    const cfg = db.getConfig(guild.id);
    if (cfg.transcript_channel) {
      const target = await guild.channels.fetch(cfg.transcript_channel).catch(() => null);
      if (target?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle(`Ticket closed: ${ticket.service_name}`)
          .setColor(0xed4245)
          .addFields(
            { name: "Client", value: `<@${ticket.user_id}>`, inline: true },
            { name: "Price", value: ticket.price, inline: true },
            { name: "Closed by", value: `<@${interaction.user.id}>`, inline: true },
          )
          .setTimestamp();
        const file = new AttachmentBuilder(Buffer.from(transcript, "utf8"), { name: `ticket-${ticket.id}.txt` });
        await target.send({ embeds: [embed], files: [file] }).catch(err => console.error("transcript post failed:", err));
      }
    }

    await interaction.channel.delete().catch(err => console.error("channel delete failed:", err));
  },
};

export default closeticket;
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/closeticket.ts
git commit -m "feat: close ticket with transcript archive"
```

---

### Task 10: /portfolio command

**Files:**
- Create: `src/commands/portfolio.ts`

**Interfaces:**
- Consumes: `db.addPortfolio/getPortfolioItem/setPortfolioMessage/removePortfolio/listPortfolio`, `db.getConfig`.
- Produces: `/portfolio add|remove|list`, posting embeds to the configured portfolio channel.

- [ ] **Step 1: Write src/commands/portfolio.ts**

```ts
import {
  EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
  type AutocompleteInteraction, type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../registry.js";
import { db } from "../state.js";

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

const portfolio: Command = {
  data: new SlashCommandBuilder()
    .setName("portfolio")
    .setDescription("Manage the project showcase")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub.setName("add").setDescription("Add a project to the showcase")
      .addStringOption(o => o.setName("name").setDescription("Project name").setRequired(true).setMaxLength(80))
      .addStringOption(o => o.setName("description").setDescription("What it is / what you built").setRequired(true).setMaxLength(1000))
      .addStringOption(o => o.setName("image").setDescription("Screenshot URL (https://…)"))
      .addStringOption(o => o.setName("link").setDescription("Live/demo link (https://…)")))
    .addSubcommand(sub => sub.setName("remove").setDescription("Remove a project")
      .addStringOption(o => o.setName("name").setDescription("Project to remove").setRequired(true).setAutocomplete(true)))
    .addSubcommand(sub => sub.setName("list").setDescription("List showcase projects")),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) return;
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === "add") {
      const cfg = db.getConfig(guildId);
      if (!cfg.portfolio_channel) {
        await interaction.reply({ content: "Set a portfolio channel first: `/config set setting:Portfolio channel`.", flags: MessageFlags.Ephemeral });
        return;
      }
      const name = interaction.options.getString("name", true);
      if (db.getPortfolioItem(guildId, name)) {
        await interaction.reply({ content: `A project named **${name}** already exists.`, flags: MessageFlags.Ephemeral });
        return;
      }
      const image = interaction.options.getString("image");
      const link = interaction.options.getString("link");
      if ((image && !isHttpUrl(image)) || (link && !isHttpUrl(link))) {
        await interaction.reply({ content: "Image and link must be full `https://` URLs.", flags: MessageFlags.Ephemeral });
        return;
      }
      const channel = await interaction.guild.channels.fetch(cfg.portfolio_channel).catch(() => null);
      if (!channel?.isTextBased()) {
        await interaction.reply({ content: "The configured portfolio channel no longer exists — set it again.", flags: MessageFlags.Ephemeral });
        return;
      }
      const item = db.addPortfolio(guildId, name, interaction.options.getString("description", true), image, link);
      const embed = new EmbedBuilder().setTitle(name).setColor(0x5865f2).setDescription(item.description).setTimestamp();
      if (image) embed.setImage(image);
      if (link) embed.setURL(link);
      const msg = await channel.send({ embeds: [embed] });
      db.setPortfolioMessage(item.id, msg.id);
      await interaction.reply({ content: `**${name}** posted to ${channel}.`, flags: MessageFlags.Ephemeral });
    } else if (sub === "remove") {
      const name = interaction.options.getString("name", true);
      const item = db.getPortfolioItem(guildId, name);
      if (!item) {
        await interaction.reply({ content: `No project named **${name}**.`, flags: MessageFlags.Ephemeral });
        return;
      }
      const cfg = db.getConfig(guildId);
      if (item.message_id && cfg.portfolio_channel) {
        const channel = await interaction.guild.channels.fetch(cfg.portfolio_channel).catch(() => null);
        if (channel?.isTextBased()) await channel.messages.delete(item.message_id).catch(() => {});
      }
      db.removePortfolio(item.id);
      await interaction.reply({ content: `Removed **${name}**.`, flags: MessageFlags.Ephemeral });
    } else {
      const items = db.listPortfolio(guildId);
      const body = items.length
        ? items.map(p => `**${p.name}**${p.link ? ` — <${p.link}>` : ""}`).join("\n")
        : "No projects yet. Add one with `/portfolio add`.";
      await interaction.reply({ content: body, flags: MessageFlags.Ephemeral });
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    if (!interaction.inGuild()) return;
    const q = interaction.options.getFocused().toLowerCase();
    const names = db.listPortfolio(interaction.guildId)
      .map(p => p.name).filter(n => n.toLowerCase().includes(q)).slice(0, 25);
    await interaction.respond(names.map(n => ({ name: n, value: n })));
  },
};

export default portfolio;
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/commands/portfolio.ts
git commit -m "feat: /portfolio showcase commands"
```

---

### Task 11: /vouch command

**Files:**
- Create: `src/commands/vouch.ts`

**Interfaces:**
- Consumes: `db.getUnvouchedClosedTicket/addVouch/markVouched/getConfig`.
- Produces: `/vouch rating:<1-5> comment:<text>` — gated on an unvouched closed ticket.

- [ ] **Step 1: Write src/commands/vouch.ts**

```ts
import {
  EmbedBuilder, MessageFlags, SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../registry.js";
import { db } from "../state.js";

const vouch: Command = {
  data: new SlashCommandBuilder()
    .setName("vouch")
    .setDescription("Leave a review after a completed order")
    .addIntegerOption(o => o.setName("rating").setDescription("1-5 stars").setRequired(true).setMinValue(1).setMaxValue(5))
    .addStringOption(o => o.setName("comment").setDescription("How did it go?").setRequired(true).setMaxLength(500)),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) return;
    const guildId = interaction.guildId;

    const cfg = db.getConfig(guildId);
    if (!cfg.vouch_channel) {
      await interaction.reply({ content: "Vouches aren't set up yet — an admin needs to run `/config set setting:Vouch channel`.", flags: MessageFlags.Ephemeral });
      return;
    }
    const ticket = db.getUnvouchedClosedTicket(guildId, interaction.user.id);
    if (!ticket) {
      await interaction.reply({ content: "Vouches are reserved for clients with a completed order ticket.", flags: MessageFlags.Ephemeral });
      return;
    }
    const channel = await interaction.guild.channels.fetch(cfg.vouch_channel).catch(() => null);
    if (!channel?.isTextBased()) {
      await interaction.reply({ content: "The configured vouch channel no longer exists — an admin needs to set it again.", flags: MessageFlags.Ephemeral });
      return;
    }

    const rating = interaction.options.getInteger("rating", true);
    const comment = interaction.options.getString("comment", true);
    db.addVouch(guildId, interaction.user.id, ticket.id, rating, comment);
    db.markVouched(ticket.id);

    const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
    const embed = new EmbedBuilder()
      .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
      .setColor(0xfee75c)
      .setTitle(stars)
      .setDescription(comment)
      .addFields({ name: "Service", value: ticket.service_name, inline: true })
      .setTimestamp();
    await channel.send({ embeds: [embed] });
    await interaction.reply({ content: "Thanks for the vouch!", flags: MessageFlags.Ephemeral });
  },
};

export default vouch;
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/commands/vouch.ts
git commit -m "feat: /vouch reviews gated on completed tickets"
```

---

### Task 12: Welcome messages

**Files:**
- Create: `src/events/guildMemberAdd.ts`
- Modify: `src/index.ts` (wire the event)

**Interfaces:**
- Consumes: `db.getConfig`, `renderWelcome`, `DEFAULT_WELCOME` (Task 3).
- Produces: `handleMemberAdd(member: GuildMember): Promise<void>` exported for wiring; skips bots and unconfigured guilds.

- [ ] **Step 1: Write src/events/guildMemberAdd.ts**

```ts
import { EmbedBuilder, type GuildMember } from "discord.js";
import { db } from "../state.js";
import { renderWelcome, DEFAULT_WELCOME } from "../lib/welcome.js";

export async function handleMemberAdd(member: GuildMember): Promise<void> {
  if (member.user.bot) return;
  const cfg = db.getConfig(member.guild.id);
  if (!cfg.welcome_channel) return;
  const channel = await member.guild.channels.fetch(cfg.welcome_channel).catch(() => null);
  if (!channel?.isTextBased()) return;
  const text = renderWelcome(cfg.welcome_message ?? DEFAULT_WELCOME, `<@${member.id}>`);
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setDescription(text)
    .setThumbnail(member.user.displayAvatarURL())
    .setFooter({ text: `Member #${member.guild.memberCount}` });
  await channel.send({ content: `<@${member.id}>`, embeds: [embed] });
}
```

- [ ] **Step 2: Wire into src/index.ts** — add import and listener:

```ts
import { handleMemberAdd } from "./events/guildMemberAdd.js";
```

After the `InteractionCreate` handler:
```ts
client.on(Events.GuildMemberAdd, (member) => {
  handleMemberAdd(member).catch(err => console.error("welcome failed:", err));
});
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/events/guildMemberAdd.ts src/index.ts
git commit -m "feat: welcome messages on member join"
```

---

### Task 13: Counter channels — /setup counters + updater

**Files:**
- Create: `src/lib/counterService.ts`
- Modify: `src/commands/setup.ts` (add `counters` subcommand), `src/index.ts` (start timer, hook join/leave), `src/events/guildMemberAdd.ts` is NOT modified (join hook goes in index.ts)

**Interfaces:**
- Consumes: `shouldRename`, `MIN_RENAME_INTERVAL_MS`, `CounterState` (Task 3), `db.getConfig/setConfig`.
- Produces: `updateGuildCounters(guild: Guild): Promise<void>` (throttle-aware; safe to call often), `startCounterTimer(client: Client): void` (5-minute interval over all guilds).

- [ ] **Step 1: Write src/lib/counterService.ts**

```ts
import type { Client, Guild } from "discord.js";
import { db } from "../state.js";
import { shouldRename, type CounterState } from "./counters.js";

const states = new Map<string, CounterState>();

function stateFor(channelId: string): CounterState {
  let s = states.get(channelId);
  if (!s) {
    s = { lastRename: 0, lastValue: null };
    states.set(channelId, s);
  }
  return s;
}

async function renameIfNeeded(guild: Guild, channelId: string, label: string, value: number): Promise<void> {
  const state = stateFor(channelId);
  if (!shouldRename(state, value, Date.now())) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return;
  await channel.setName(`${label}: ${value}`).catch(err => console.error("rename failed:", err));
  state.lastRename = Date.now();
  state.lastValue = value;
}

export async function updateGuildCounters(guild: Guild): Promise<void> {
  const cfg = db.getConfig(guild.id);
  if (!cfg.member_counter_channel && !cfg.bot_counter_channel) return;
  const members = guild.members.cache;
  const bots = members.filter(m => m.user.bot).size;
  const humans = members.size - bots;
  if (cfg.member_counter_channel) await renameIfNeeded(guild, cfg.member_counter_channel, "Members", humans);
  if (cfg.bot_counter_channel) await renameIfNeeded(guild, cfg.bot_counter_channel, "Bots", bots);
}

export function startCounterTimer(client: Client): void {
  setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      updateGuildCounters(guild).catch(err => console.error("counter update failed:", err));
    }
  }, 5 * 60 * 1000);
}
```

- [ ] **Step 2: Add `counters` subcommand to src/commands/setup.ts**

Add to the builder chain after the storefront subcommand:
```ts
    .addSubcommand(sub => sub.setName("counters")
      .setDescription("Create locked member/bot counter voice channels")),
```

Add imports (`PermissionFlagsBits` is already imported in this file from Task 7 — do not re-import it):
```ts
import { db } from "../state.js";
import { updateGuildCounters } from "../lib/counterService.js";
```

Add branch in `execute` after the storefront branch:
```ts
    if (sub === "counters") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const guild = interaction.guild;
      const make = (name: string) => guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] },
        ],
      });
      const memberCh = await make("Members: …");
      const botCh = await make("Bots: …");
      db.setConfig(guild.id, "member_counter_channel", memberCh.id);
      db.setConfig(guild.id, "bot_counter_channel", botCh.id);
      await guild.members.fetch();
      await updateGuildCounters(guild);
      await interaction.editReply("Counter channels created. They update every ~5 minutes (Discord rename rate limits).");
    }
```

- [ ] **Step 3: Wire timer + join/leave refresh in src/index.ts**

Add imports:
```ts
import { startCounterTimer, updateGuildCounters } from "./lib/counterService.js";
```

In the `ClientReady` handler, after member fetch loop:
```ts
  for (const guild of c.guilds.cache.values()) {
    await updateGuildCounters(guild).catch(err => console.error("initial counters failed:", err));
  }
  startCounterTimer(c);
```

In the `GuildMemberAdd` listener body, add after handleMemberAdd:
```ts
  updateGuildCounters(member.guild).catch(err => console.error("counters failed:", err));
```

Add a `GuildMemberRemove` listener:
```ts
client.on(Events.GuildMemberRemove, (member) => {
  updateGuildCounters(member.guild).catch(err => console.error("counters failed:", err));
});
```

- [ ] **Step 4: Build and run all tests**

Run: `npm run build && npm test`
Expected: build success, all vitest suites PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/counterService.ts src/commands/setup.ts src/index.ts
git commit -m "feat: throttled member/bot counter voice channels"
```

---

### Task 14: README + Railway deploy config + final verification

**Files:**
- Create: `README.md`, `railway.json`

**Interfaces:**
- Consumes: everything.
- Produces: deployable repo.

- [ ] **Step 1: Write railway.json**

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

- [ ] **Step 2: Write README.md**

Content must cover, in this order:
1. What the bot is (one paragraph) + feature list.
2. **Discord setup:** create app at discord.com/developers → Bot tab → copy token; enable **Server Members Intent** and **Message Content Intent** (both required); invite URL template with scopes `bot applications.commands` and permissions `Manage Channels, View Channels, Send Messages, Read Message History, Connect` (permissions integer 285615188752 or generate via the portal's URL generator).
3. **Local dev:** `npm install`, copy `.env.example` → set `DISCORD_TOKEN` + `GUILD_ID` (dev server id, makes commands register instantly), `npm run dev`. Note: on Windows set env vars in the shell or use a `.env` loader via `tsx --env-file=.env` — document the exact dev command `npx tsx --env-file=.env watch src/index.ts` as an alternative.
4. **First-time in-Discord setup:** `/config set` each channel, `/service add` services, `/setup storefront`, `/setup counters`, `/config welcome-message`.
5. **Railway deploy:** push repo to GitHub → New Project → Deploy from GitHub repo → add volume mounted at `/data` → set env vars `DISCORD_TOKEN`, `DB_PATH=/data/devdesk.db` (omit `GUILD_ID` for global commands, or set it for one server) → deploy.
6. Command reference table (all commands + who can use them).

- [ ] **Step 3: Full verification**

Run: `npm run build && npm test`
Expected: clean build, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add README.md railway.json
git commit -m "docs: README and Railway deploy config"
```

---

## Manual verification checklist (post-implementation, needs the user's token)

Not executable without a Discord token/server; the user runs these after deploying:

1. `/ping` responds.
2. `/config view` shows all settings unset; `/config set` each one.
3. `/service add` twice → `/setup storefront` shows both with Order buttons.
4. Click Order → private ticket channel appears; second click → "already have an open ticket".
5. Close Ticket → transcript lands in transcript channel, channel deleted.
6. `/vouch` before any closed ticket → rejected; after close → posts stars embed.
7. `/portfolio add` with image → embed in portfolio channel.
8. Member join → welcome message; counters update within ~5 min.
