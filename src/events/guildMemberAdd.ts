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
