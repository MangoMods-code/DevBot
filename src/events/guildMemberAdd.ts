import { EmbedBuilder, time, TimestampStyles, type GuildMember } from "discord.js";
import { db } from "../state.js";
import { renderWelcome, DEFAULT_WELCOME } from "../lib/welcome.js";

export async function handleMemberAdd(member: GuildMember): Promise<void> {
  if (member.user.bot) return;
  const cfg = db.getConfig(member.guild.id);
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
