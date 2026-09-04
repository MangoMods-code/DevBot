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

// The member cache is only fully populated once (on first ClientReady). If the gateway
// ever drops and reconnects — normal over long uptimes — Discord.js rebuilds guild state
// without re-fetching the full member list, so the cache can silently shrink down to just
// whoever's recently interacted with the bot. Re-fetching here before every periodic tick
// keeps the cache (and therefore the counters) self-healing instead of staying stuck stale.
async function refreshAndUpdate(guild: Guild): Promise<void> {
  await guild.members.fetch().catch(err => console.error(`member fetch failed for ${guild.id}:`, err));
  await updateGuildCounters(guild).catch(err => console.error("counter update failed:", err));
}

export function startCounterTimer(client: Client): void {
  setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      refreshAndUpdate(guild);
    }
  }, 5 * 60 * 1000);
}
