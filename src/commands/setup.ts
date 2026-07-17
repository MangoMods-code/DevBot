import {
  ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
  type ChatInputCommandInteraction, type GuildTextBasedChannel,
} from "discord.js";
import type { Command } from "../registry.js";
import { postStorefront } from "../lib/storefront.js";
import { postRules } from "../lib/rules.js";
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
      .setDescription("Create locked member/bot counter voice channels"))
    .addSubcommand(sub => sub.setName("rules")
      .setDescription("Post (or refresh) the server rules")
      .addChannelOption(o => o.setName("channel").setDescription("Rules channel (remembered for next time)")
        .addChannelTypes(ChannelType.GuildText))),

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

    if (sub === "rules") {
      const picked = interaction.options.getChannel("channel");
      const cfg = db.getConfig(interaction.guild.id);
      const channelId = picked?.id ?? cfg.rules_channel;
      if (!channelId) {
        await interaction.reply({
          content: "Tell me where the rules go: `/setup rules channel:#rules` (I'll remember it).",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (!channel?.isTextBased()) {
        await interaction.reply({ content: "That rules channel no longer exists — pick another one.", flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      db.setConfig(interaction.guild.id, "rules_channel", channel.id);
      await postRules(interaction.guild, channel);
      await interaction.editReply(`Rules posted in ${channel}. Re-run \`/setup rules\` any time to refresh them (the old post gets replaced).`);
    }
  },
};

export default setup;
