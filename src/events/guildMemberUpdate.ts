import { EmbedBuilder, type GuildMember, type PartialGuildMember } from "discord.js";
import { db } from "../state.js";
import { isNewBoost } from "../lib/boost.js";

const TIER_LABEL: Record<number, string> = {
  0: "No level yet",
  1: "Level 1",
  2: "Level 2",
  3: "Level 3",
};

export async function handleMemberUpdate(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember,
): Promise<void> {
  if (!isNewBoost(oldMember.premiumSince ?? null, newMember.premiumSince ?? null)) return;

  const cfg = db.getConfig(newMember.guild.id);
  if (!cfg.welcome_channel) return;
  const channel = await newMember.guild.channels.fetch(cfg.welcome_channel).catch(() => null);
  if (!channel?.isTextBased()) return;

  const boosts = newMember.guild.premiumSubscriptionCount ?? 0;
  const embed = new EmbedBuilder()
    .setColor(0xf47fff)
    .setTitle("🚀 New Server Boost!")
    .setDescription(`<@${newMember.id}> just boosted the server — huge thanks! 💜`)
    .setThumbnail(newMember.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "Total boosts", value: `${boosts}`, inline: true },
      { name: "Boost level", value: TIER_LABEL[newMember.guild.premiumTier] ?? "Unknown", inline: true },
    )
    .setFooter({ text: "Boosts keep the server looking sharp — thank you!" })
    .setTimestamp();

  await channel.send({ content: `<@${newMember.id}>`, embeds: [embed] });
}
