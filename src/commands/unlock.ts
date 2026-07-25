import {
  EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../registry.js";

const unlock: Command = {
  data: new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock this channel so members can send messages again")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) return;
    const channel = interaction.channel;
    if (!channel || channel.isDMBased() || channel.isThread() || !channel.isTextBased()) {
      await interaction.reply({ content: "I can only unlock a regular text or voice channel — not threads or DMs.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      // null clears the overwrite so the channel falls back to its category/default permissions.
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: null,
        SendMessagesInThreads: null,
      });
    } catch (err) {
      console.error("unlock failed:", err);
      await interaction.editReply("Couldn't unlock this channel — make sure I have **Manage Channels** and a role above `@everyone`.");
      return;
    }

    await channel.send({
      embeds: [new EmbedBuilder().setColor(0x57f287)
        .setDescription("🔓 **Channel unlocked.** Everyone can send messages again.")],
    }).catch(() => {});
    await interaction.editReply("Unlocked.");
  },
};

export default unlock;
