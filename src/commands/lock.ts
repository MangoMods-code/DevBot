import {
  EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../registry.js";

const lock: Command = {
  data: new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock this channel so only staff can send messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) return;
    const channel = interaction.channel;
    if (!channel || channel.isDMBased() || channel.isThread() || !channel.isTextBased()) {
      await interaction.reply({ content: "I can only lock a regular text or voice channel — not threads or DMs.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: false,
        SendMessagesInThreads: false,
      });
    } catch (err) {
      console.error("lock failed:", err);
      await interaction.editReply("Couldn't lock this channel — make sure I have **Manage Channels** and a role above `@everyone`.");
      return;
    }

    await channel.send({
      embeds: [new EmbedBuilder().setColor(0xed4245)
        .setDescription("🔒 **Channel locked.** Only staff can send messages right now.")],
    }).catch(() => {});
    await interaction.editReply("Locked. Unlock it any time with `/unlock`.");
  },
};

export default lock;
