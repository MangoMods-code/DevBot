import {
  ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../registry.js";
import { db } from "../state.js";
import type { ConfigKey } from "../db.js";

const CHANNEL_SETTINGS: { key: ConfigKey; label: string }[] = [
  { key: "welcome_channel", label: "Welcome channel" },
  { key: "ticket_category", label: "Ticket category" },
  { key: "transcript_channel", label: "Transcript channel" },
  { key: "portfolio_channel", label: "Portfolio channel" },
  { key: "vouch_channel", label: "Vouch channel" },
  { key: "member_counter_channel", label: "Member counter voice channel" },
  { key: "bot_counter_channel", label: "Bot counter voice channel" },
];

const config: Command = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configure DevDesk channels and messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub
      .setName("set")
      .setDescription("Point a DevDesk feature at a channel")
      .addStringOption(o => o.setName("setting").setDescription("Which setting").setRequired(true)
        .addChoices(...CHANNEL_SETTINGS.map(s => ({ name: s.label, value: s.key }))))
      .addChannelOption(o => o.setName("channel").setDescription("The channel").setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildCategory)))
    .addSubcommand(sub => sub
      .setName("welcome-message")
      .setDescription("Set the welcome message ({user} = new member)")
      .addStringOption(o => o.setName("message").setDescription("Template, {user} mentions the member").setRequired(true)))
    .addSubcommand(sub => sub.setName("view").setDescription("Show current configuration")),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) return;
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === "set") {
      const key = interaction.options.getString("setting", true) as ConfigKey;
      const channel = interaction.options.getChannel("channel", true);
      db.setConfig(guildId, key, channel.id);
      await interaction.reply({ content: `Set **${key}** to ${channel}`, flags: MessageFlags.Ephemeral });
    } else if (sub === "welcome-message") {
      const message = interaction.options.getString("message", true);
      db.setConfig(guildId, "welcome_message", message);
      await interaction.reply({ content: "Welcome message updated.", flags: MessageFlags.Ephemeral });
    } else {
      const cfg = db.getConfig(guildId);
      const lines = CHANNEL_SETTINGS.map(s => {
        const v = cfg[s.key];
        return `**${s.label}:** ${v ? `<#${v}>` : "*not set*"}`;
      });
      lines.push(`**Welcome message:** ${cfg.welcome_message ?? "*default*"}`);
      await interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
    }
  },
};

export default config;
