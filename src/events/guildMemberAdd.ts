import { EmbedBuilder, time, TimestampStyles, type GuildMember } from "discord.js";
import { db } from "../state.js";
import { renderWelcome, DEFAULT_WELCOME } from "../lib/welcome.js";

// Gateway reconnects can occasionally redeliver a GuildMemberAdd event the bot already
// processed, which used to send the welcome message (and re-run autorole) twice for the
// same join. Claim the join in-memory before doing anything else so a redelivered event
// within the window is dropped; a real re-join after that window still gets welcomed.
const recentJoins = new Set<string>();
const JOIN_DEDUPE_WINDOW_MS = 15_000;

function claimJoin(key: string): boolean {
  if (recentJoins.has(key)) return false;
  recentJoins.add(key);
  setTimeout(() => recentJoins.delete(key), JOIN_DEDUPE_WINDOW_MS);
  return true;
}

export async function handleMemberAdd(member: GuildMember): Promise<void> {
  if (member.user.bot) return;
  if (!claimJoin(`${member.guild.id}:${member.id}`)) return;
  const cfg = db.getConfig(member.guild.id);

  if (cfg.autorole_id) {
    await member.roles.add(cfg.autorole_id, "autorole").catch(err => console.error("autorole failed:", err));
  }

  if (!cfg.welcome_channel) return;
  const channel = await member.guild.channels.fetch(cfg.welcome_channel).catch(() => null);
  if (!channel?.isTextBased()) return;

  const text = renderWelcome(cfg.welcome_message ?? DEFAULT_WELCOME, `<@${member.id}>`);
  const storefront = db.getStorefront(member.guild.id);

  const getStarted = [
    storefront ? `🛒 Browse services in <#${storefront.channel_id}>` : "🛒 Order any time with `/order`",
    storefront ? "🎫 Click an **Order** button there to open a private ticket" : "🎫 A private ticket opens just for you",
    cfg.vouch_channel ? `⭐ See what clients say in <#${cfg.vouch_channel}>` : null,
    cfg.portfolio_channel ? `🖼️ Check out past work in <#${cfg.portfolio_channel}>` : null,
  ].filter((line): line is string => line !== null);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setAuthor({
      name: member.guild.name,
      iconURL: member.guild.iconURL({ size: 128 }) ?? undefined,
    })
    .setTitle(`👋 Welcome, ${member.user.displayName}!`)
    .setDescription(text)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "🚀 Get started", value: getStarted.join("\n") },
      { name: "📅 Account created", value: time(member.user.createdAt, TimestampStyles.RelativeTime), inline: true },
      { name: "🧮 You're member", value: `**#${member.guild.memberCount}**`, inline: true },
    )
    .setFooter({ text: "Glad you're here — make yourself at home." })
    .setTimestamp();

  await channel.send({ content: `<@${member.id}>`, embeds: [embed] });
}
