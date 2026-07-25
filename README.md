# DevDesk Bot

A Discord bot that runs your dev-services front desk: a storefront of services with one-click order tickets, a project showcase, client vouches, welcome messages, and live member/bot counter channels. Payments are arranged manually inside tickets — the bot never touches money. All data lives in a local SQLite database.

**Features**

- 🛠️ **Storefront** — persistent embed listing your services, each with an Order button; auto-updates when you change services
- 🎫 **Order tickets** — private channel per order (buyer + staff only), with a saved transcript when closed
- 🖼️ **Portfolio** — showcase embeds for your projects with screenshots and links
- ⭐ **Vouches** — star-rating reviews, only allowed from clients with a real completed ticket
- 👋 **Welcome messages** — customizable template with `{user}` placeholder
- 🔢 **Counter channels** — locked voice channels showing member and bot counts (rate-limit aware)

## 1. Discord setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** → name it.
2. **Bot** tab → **Reset Token** → copy the token (this is your `DISCORD_TOKEN`).
3. Still on the Bot tab, enable both privileged intents — the bot won't start without them:
   - **Server Members Intent** (welcome messages + counters)
   - **Message Content Intent** (ticket transcripts)
4. **Installation** tab (or OAuth2 → URL Generator): scopes `bot` + `applications.commands`; bot permissions: **Manage Channels, Manage Roles, Manage Messages, Kick Members, Ban Members, Moderate Members, View Channels, Send Messages, Read Message History, Connect, Attach Files**. Open the generated URL and invite the bot to your server. (Already invited it with fewer permissions? Just tick the missing ones on the bot's role in Server Settings → Roles.)

## 2. Local development

```bash
npm install
copy .env.example .env    # then edit .env with your token
```

Set in `.env`:

- `DISCORD_TOKEN` — from step 1.2
- `GUILD_ID` — your dev server's ID (right-click server → Copy Server ID, with Developer Mode on). With this set, slash commands register instantly in that one server; without it they register globally, which can take up to an hour to appear.

Run it:

```bash
npx tsx --env-file=.env watch src/index.ts
```

(`npm run dev` works too if you set the env vars in your shell instead of `.env`.)

## 3. First-time setup in Discord

All of these are admin-only (Manage Server permission):

1. `/config set` — point each setting at a channel: ticket category, transcript channel, portfolio channel, vouch channel, welcome channel.
2. `/service add` — add each service you sell (name, price, description).
3. `/setup storefront channel:#your-shop` — posts the storefront embed with Order buttons.
4. `/setup counters` — creates the locked Members/Bots voice counters.
5. `/config welcome-message` — optional; customize the greeting (`{user}` mentions the newcomer).

## 4. Deploy to Railway

1. Push this repo to GitHub.
2. Railway → **New Project** → **Deploy from GitHub repo** → pick the repo. Nixpacks auto-detects Node and runs `npm run build` + `npm start` (see `railway.json`).
3. In the service settings, add a **Volume** mounted at `/data` — Railway's filesystem is wiped on every deploy; the volume is where the database survives.
4. Add environment variables:
   - `DISCORD_TOKEN` — your bot token
   - `DB_PATH` — `/data/devdesk.db`
   - `GUILD_ID` — optional; set it if the bot only lives in one server (instant command updates), omit for global commands.
5. Deploy. Check the logs for `Logged in as …` and `Registered N … commands`.

## Command reference

| Command | Who | What |
|---|---|---|
| `/ping` | everyone | Latency + uptime |
| `/order service:<name>` | everyone | Open an order ticket (same as clicking a storefront button) |
| `/vouch rating:<1-5> comment:<text>` | clients with a closed ticket | Post a star-rating review |
| `/addvouch customer:<name> rating:<1-5> comment:<text>` | admin | Post a vouch for a client who isn't on Discord (marked as staff-submitted) |
| `/config set` / `view` / `welcome-message` | admin | Wire up channels and the welcome template |
| `/service add` / `edit` / `remove` / `list` | admin | Manage the services you sell |
| `/portfolio add` / `remove` / `list` | admin | Manage the project showcase |
| `/setup storefront` / `counters` / `rules` | admin | Post the storefront / create counter channels / post the rules |
| `/roleall role:<role>` | admin (Manage Roles) | Give a role to every member who doesn't have it |
| `/autorole set` / `off` / `view` | admin (Manage Roles) | Auto-assign a role to new members |
| `/automod keyword-add` / `keyword-remove` / `keyword-list` | admin | Filter words/phrases → delete, kick, or ban |
| `/automod links` / `mentions` / `view` | admin | Link filter with bypass role · mass-mention limit · settings overview |
| **Close Ticket** button | ticket owner or admin | Archive transcript and delete the ticket channel |

Automod notes: members with **Manage Messages** (your staff) bypass every filter, keyword matching is case-insensitive, the link filter catches `http(s)`, `www.`, and Discord invites, and `@everyone` counts as 5 toward the mention limit.

## Development

```bash
npm test        # vitest unit tests (DB layer + pure logic)
npm run build   # type-check and compile to dist/
```
