import {
  ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
  type ChatInputCommandInteraction, type GuildTextBasedChannel,
} from "discord.js";
import type { Command } from "../registry.js";
import { postStorefront } from "../lib/storefront.js";
import { db } from "../state.js";
import { updateGuildCounters } from "../lib/counterService.js";

const setup: Command = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Set up DevDesk fixtures")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub.setName("storefront")
      .setDescription("Post (or move) the storefront embed")
      .addChannelOption(o => o.setName("channel").setDescription("Channel for the storefront")
        .setRequired(true).addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(sub => sub.setName("counters")
      .setDescription("Create locked member/bot counter voice channels")),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) return;
    const sub = interaction.options.getSubcommand();

    if (sub === "storefront") {
      const channel = interaction.options.getChannel("channel", true) as GuildTextBasedChannel;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await postStorefront(interaction.guild, channel);
      await interaction.editReply(`Storefront posted in ${channel}. It auto-updates when you change services.`);
    }

    if (sub === "counters") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const guild = interaction.guild;
      const make = (name: string) => guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] },
        ],
      });
      const memberCh = await make("Members: …");
      const botCh = await make("Bots: …");
      db.setConfig(guild.id, "member_counter_channel", memberCh.id);
      db.setConfig(guild.id, "bot_counter_channel", botCh.id);
      await guild.members.fetch();
      await updateGuildCounters(guild);
      await interaction.editReply("Counter channels created. They update every ~5 minutes (Discord rename rate limits).");
    }
  },
};

export default setup;
