import { PermissionFlagsBits, type Message } from "discord.js";
import { db } from "../state.js";
import { matchKeyword, hasLink, mentionScore, type KeywordRule } from "../lib/automod.js";

const NOTICE_TTL_MS = 6000;
const MENTION_TIMEOUT_MS = 10 * 60 * 1000;

async function notice(msg: Message, text: string): Promise<void> {
  if (!msg.channel.isSendable()) return;
  const n = await msg.channel.send(text).catch(() => null);
  if (n) setTimeout(() => { n.delete().catch(() => {}); }, NOTICE_TTL_MS);
}

async function punish(msg: Message, action: string, reason: string): Promise<void> {
  const member = msg.member;
  if (!member) return;
  if (action === "kick" && member.kickable) {
    await member.kick(reason).catch(err => console.error("automod kick failed:", err));
  } else if (action === "ban" && member.bannable) {
    await member.ban({ reason, deleteMessageSeconds: 3600 }).catch(err => console.error("automod ban failed:", err));
  }
}

export async function handleMessage(msg: Message): Promise<void> {
  if (!msg.inGuild() || msg.author.bot) return;
  const member = msg.member;
  if (!member) return;
  // Staff bypass everything — also keeps the bot from ever punishing the owner.
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  const cfg = db.getConfig(msg.guildId);

  const keywords = db.listKeywords(msg.guildId) as KeywordRule[];
  const hit = matchKeyword(msg.content, keywords);
  if (hit) {
    await msg.delete().catch(() => {});
    await punish(msg, hit.action, `automod keyword: ${hit.word}`);
    if (hit.action === "delete") await notice(msg, `${msg.author} that language isn't allowed here.`);
    return;
  }

  const linkAction = cfg.link_action ?? "off";
  if (linkAction !== "off" && hasLink(msg.content)) {
    const bypassed = cfg.link_bypass_role != null && member.roles.cache.has(cfg.link_bypass_role);
    if (!bypassed) {
      await msg.delete().catch(() => {});
      await punish(msg, linkAction, "automod: unauthorized link");
      if (linkAction === "delete") await notice(msg, `${msg.author} links aren't allowed without the link role.`);
      return;
    }
  }

  const limit = Number(cfg.mention_limit ?? 0);
  if (limit > 0) {
    const score = mentionScore(msg.mentions.users.size, msg.mentions.roles.size, msg.mentions.everyone);
    if (score >= limit) {
      await msg.delete().catch(() => {});
      if (member.moderatable) {
        await member.timeout(MENTION_TIMEOUT_MS, "automod: mention spam").catch(() => {});
      }
      await notice(msg, `${msg.author} easy on the pings — that's a 10 minute timeout.`);
    }
  }
}
