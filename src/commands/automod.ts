import {
  MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
  type AutocompleteInteraction, type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../registry.js";
import { db } from "../state.js";

const ACTION_CHOICES = [
  { name: "Delete the message", value: "delete" },
  { name: "Delete + kick the member", value: "kick" },
  { name: "Delete + ban the member", value: "ban" },
];

const automod: Command = {
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Automatic moderation settings")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub.setName("keyword-add").setDescription("Filter a word or phrase")
      .addStringOption(o => o.setName("word").setDescription("Word/phrase to filter (case-insensitive)").setRequired(true).setMaxLength(100))
      .addStringOption(o => o.setName("action").setDescription("What happens to whoever says it").setRequired(true)
        .addChoices(...ACTION_CHOICES)))
    .addSubcommand(sub => sub.setName("keyword-remove").setDescription("Stop filtering a word")
      .addStringOption(o => o.setName("word").setDescription("Word to unfilter").setRequired(true).setAutocomplete(true)))
    .addSubcommand(sub => sub.setName("keyword-list").setDescription("Show filtered words"))
    .addSubcommand(sub => sub.setName("links").setDescription("Control link posting")
      .addStringOption(o => o.setName("action").setDescription("What happens to unauthorized links").setRequired(true)
        .addChoices({ name: "Off — links allowed for everyone", value: "off" }, ...ACTION_CHOICES))
      .addRoleOption(o => o.setName("bypass_role").setDescription("Members with this role can always post links")))
    .addSubcommand(sub => sub.setName("mentions").setDescription("Limit mass mentions")
      .addIntegerOption(o => o.setName("limit").setDescription("Mentions per message before delete + 10min timeout (0 = off)")
        .setRequired(true).setMinValue(0).setMaxValue(25)))
    .addSubcommand(sub => sub.setName("view").setDescription("Show all automod settings")),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!interaction.inGuild() || !guild) return;
    const sub = interaction.options.getSubcommand();

    if (sub === "keyword-add") {
      const word = interaction.options.getString("word", true).trim();
      const action = interaction.options.getString("action", true);
      db.addKeyword(guild.id, word, action);
      await interaction.reply({ content: `Filtering **${word.toLowerCase()}** → ${action}.`, flags: MessageFlags.Ephemeral });
    } else if (sub === "keyword-remove") {
      const word = interaction.options.getString("word", true).trim();
      const removed = db.removeKeyword(guild.id, word);
      await interaction.reply({
        content: removed ? `No longer filtering **${word.toLowerCase()}**.` : `**${word.toLowerCase()}** wasn't in the filter list.`,
        flags: MessageFlags.Ephemeral,
      });
    } else if (sub === "keyword-list") {
      const words = db.listKeywords(guild.id);
      await interaction.reply({
        content: words.length
          ? words.map(w => `• **${w.word}** → ${w.action}`).join("\n")
          : "No filtered words yet. Add one with `/automod keyword-add`.",
        flags: MessageFlags.Ephemeral,
      });
    } else if (sub === "links") {
      const action = interaction.options.getString("action", true);
      const bypass = interaction.options.getRole("bypass_role");
      db.setConfig(guild.id, "link_action", action === "off" ? null : action);
      if (bypass) db.setConfig(guild.id, "link_bypass_role", bypass.id);
      const bypassNote = action === "off" ? "" :
        bypass ? ` (bypass: ${bypass})` :
        db.getConfig(guild.id).link_bypass_role ? ` (bypass role unchanged)` : " (no bypass role set — staff always bypass)";
      await interaction.reply({
        content: action === "off" ? "Link filter off." : `Link filter on → ${action}${bypassNote}.`,
        flags: MessageFlags.Ephemeral,
      });
    } else if (sub === "mentions") {
      const limit = interaction.options.getInteger("limit", true);
      db.setConfig(guild.id, "mention_limit", limit === 0 ? null : String(limit));
      await interaction.reply({
        content: limit === 0 ? "Mention limit off." : `Messages with **${limit}+** mentions get deleted and the sender gets a 10 minute timeout (@everyone counts as 5).`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      const cfg = db.getConfig(guild.id);
      const words = db.listKeywords(guild.id);
      const lines = [
        `**Keywords:** ${words.length ? `${words.length} filtered (see \`/automod keyword-list\`)` : "none"}`,
        `**Links:** ${cfg.link_action ?? "allowed"}${cfg.link_bypass_role ? ` — bypass <@&${cfg.link_bypass_role}>` : ""}`,
        `**Mention limit:** ${cfg.mention_limit ?? "off"}`,
        `**Autorole:** ${cfg.autorole_id ? `<@&${cfg.autorole_id}>` : "off"}`,
        "",
        "_Members with Manage Messages (staff) bypass all filters._",
      ];
      await interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    if (!interaction.inGuild()) return;
    const q = interaction.options.getFocused().toLowerCase();
    const words = db.listKeywords(interaction.guildId)
      .map(w => w.word).filter(w => w.includes(q)).slice(0, 25);
    await interaction.respond(words.map(w => ({ name: w, value: w })));
  },
};

export default automod;
