# DevDesk Bot — Design Spec

**Date:** 2026-07-17
**Status:** Approved by user (conversation), pending spec review

## Purpose

A Discord bot for a dev-services server: sell development services, open order
tickets, show off portfolio projects, collect client vouches, greet members, and
display live member/bot counts. Payments are handled manually inside tickets —
the bot never touches money.

## Stack

- **Language:** TypeScript (strict mode)
- **Library:** discord.js v14
- **Storage:** SQLite via `better-sqlite3`, DB file on a Railway mounted volume
  (path from `DB_PATH` env var, default `./data/devdesk.db`)
- **Hosting:** Railway, deployed from a GitHub repo via Nixpacks (no Dockerfile)
- **No web server, no external APIs.** Single env secret: `DISCORD_TOKEN`
  (plus `CLIENT_ID` and optional `GUILD_ID` for command registration).

## Features (v1)

### 1. Config (`/config`)
Admin-only. Sets and stores per-guild channel/category IDs in the DB:
- welcome channel
- ticket category (where ticket channels are created)
- transcript channel (optional; closed-ticket summaries post here)
- portfolio channel
- vouch channel
- member-counter voice channel
- bot-counter voice channel

`/config view` shows current settings. Every feature that depends on a setting
silently no-ops (or replies with "not configured yet" for commands) until its
setting exists.

### 2. Service menu / storefront
- `/service add name:<> price:<> description:<>` — admin adds a service.
- `/service edit`, `/service remove`, `/service list` — admin management.
  Edit/remove reference services by autocompleted name.
- `/setup storefront channel:<>` — posts (or re-posts) a persistent storefront
  embed listing all services with prices. Each service gets an **Order** button
  (custom ID `order:<serviceId>`). Re-running the command updates/replaces the
  stored message. Storefront message ID stored in DB so restarts don't break
  buttons.

### 3. Order tickets
- Clicking **Order** (or `/order service:<autocomplete>`) creates a private
  text channel under the ticket category: visible to the buyer, admins, and the
  bot only. Named `ticket-<username>-<n>`.
- Opening embed shows: service name, price, buyer, timestamp, and a note that
  payment is arranged manually in this channel.
- One open ticket per user at a time (reply ephemeral error otherwise).
- **Close ticket** button (admin or ticket owner): saves a plain-text
  transcript of the channel messages to the DB, posts a summary embed (+
  transcript as a `.txt` attachment) to the transcript channel if configured,
  then deletes the channel.
- Ticket record in DB: buyer ID, service, status (open/closed), opened/closed
  timestamps, transcript text.

### 4. Portfolio
- `/portfolio add name:<> description:<> image:<url, optional> link:<url, optional>`
  — admin only. Saves to DB and posts an embed to the portfolio channel.
  Posted message ID is stored so `remove` can delete it.
- `/portfolio remove name:<autocomplete>` — deletes DB row and the posted embed.
- `/portfolio list` — ephemeral list for admins.

### 5. Vouches
- `/vouch rating:<1-5> comment:<>` — only usable by members who have at least
  one **closed** ticket (checked in DB). Posts a star-rating embed with the
  member's avatar to the vouch channel. One vouch per closed ticket (a ticket
  is "consumed" when vouched against).
- `/vouch` replies ephemeral error if user has no unvouched closed tickets.

### 6. Welcome messages
- On `guildMemberAdd` (non-bot): post an embed in the welcome channel
  mentioning the member. Message template stored in config with a
  `{user}` placeholder; `/config welcome-message` sets it. Sensible default
  template ships built-in.

### 7. Member / bot counter channels
- Two voice channels, locked (connect denied for @everyone), renamed to
  `Members: <n>` / `Bots: <n>`.
- `/setup counters` creates both channels (or adopts existing ones set via
  `/config`).
- Counts refresh on a **5-minute timer** plus on member join/leave, but renames
  are queued and throttled: Discord allows ~2 channel renames per 10 minutes,
  so the updater never renames unless the count actually changed, and at most
  once per 5 minutes per channel.

### 8. Misc
- `/ping` — latency + uptime status.
- Slash commands registered on startup: guild-scoped when `GUILD_ID` is set
  (instant, for dev), global otherwise.

## Architecture

```
src/
  index.ts          # client bootstrap, loads commands/components/events
  registry.ts       # command + component collection types and loaders
  db.ts             # better-sqlite3 init, schema (CREATE TABLE IF NOT EXISTS), typed queries
  config.ts         # guild settings read/write helpers
  commands/         # one file per slash command (data + execute)
  components/       # one file per button/modal custom-ID prefix
  events/           # guildMemberAdd, ready, etc.
  lib/              # counters updater, ticket helpers, transcript builder
```

- **Command contract:** each file in `commands/` default-exports
  `{ data: SlashCommandBuilder, execute(interaction) }`.
- **Component contract:** each file in `components/` default-exports
  `{ prefix: string, execute(interaction) }`; the router matches
  `customId.split(":")[0]`.
- **Error handling:** a single try/catch wrapper around every command/component
  dispatch replies (or follows up) with an ephemeral "Something went wrong"
  and logs the error. The process never crashes on a failed interaction.
- **DB schema tables:** `guild_config`, `services`, `tickets`, `portfolio`,
  `vouches`, `storefront_messages`.

## Permissions model

Admin = member with the `ManageGuild` permission. All management commands
(`/config`, `/service`, `/portfolio add|remove`, `/setup`) require it via
`setDefaultMemberPermissions`. `/order` and `/vouch` are open to everyone.

## Deployment (Railway)

- GitHub repo → Railway service. Nixpacks detects Node; start command
  `npm start` (runs compiled `dist/index.js`), build `npm run build` (tsc).
- Railway volume mounted at `/data`; `DB_PATH=/data/devdesk.db`.
- Env vars: `DISCORD_TOKEN`, `CLIENT_ID`, optional `GUILD_ID`.
- README documents: Discord Developer Portal setup (bot creation, intents —
  **Server Members intent required** for welcome + counters), invite URL with
  needed permissions, Railway setup incl. volume, local dev with `npm run dev`
  (tsx watch).

## Testing

- Unit tests (vitest) for pure logic: DB query helpers, counter throttle
  logic, transcript formatting, vouch eligibility.
- Discord-facing behavior verified manually in the user's dev server
  (guild-scoped commands make iteration instant).

## Out of scope (v1)

- Payment/checkout integration (Stripe, SellAuth, crypto APIs)
- Web dashboard
- Multi-language, sharding (single small guild)
- HTML transcripts (plain text only)
