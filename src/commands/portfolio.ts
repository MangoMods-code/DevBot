import {
  EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
  type AutocompleteInteraction, type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../registry.js";
import { db } from "../state.js";

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

const portfolio: Command = {
  data: new SlashCommandBuilder()
    .setName("portfolio")
    .setDescription("Manage the project showcase")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub.setName("add").setDescription("Add a project to the showcase")
      .addStringOption(o => o.setName("name").setDescription("Project name").setRequired(true).setMaxLength(80))
      .addStringOption(o => o.setName("description").setDescription("What it is / what you built").setRequired(true).setMaxLength(1000))
      .addStringOption(o => o.setName("image").setDescription("Screenshot URL (https://…)"))
      .addStringOption(o => o.setName("link").setDescription("Live/demo link (https://…)")))
    .addSubcommand(sub => sub.setName("remove").setDescription("Remove a project")
      .addStringOption(o => o.setName("name").setDescription("Project to remove").setRequired(true).setAutocomplete(true)))
    .addSubcommand(sub => sub.setName("list").setDescription("List showcase projects")),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) return;
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === "add") {
      const cfg = db.getConfig(guildId);
      if (!cfg.portfolio_channel) {
        await interaction.reply({ content: "Set a portfolio channel first: `/config set setting:Portfolio channel`.", flags: MessageFlags.Ephemeral });
        return;
      }
      const name = interaction.options.getString("name", true);
      if (db.getPortfolioItem(guildId, name)) {
        await interaction.reply({ content: `A project named **${name}** already exists.`, flags: MessageFlags.Ephemeral });
        return;
      }
      const image = interaction.options.getString("image");
      const link = interaction.options.getString("link");
      if ((image && !isHttpUrl(image)) || (link && !isHttpUrl(link))) {
        await interaction.reply({ content: "Image and link must be full `https://` URLs.", flags: MessageFlags.Ephemeral });
        return;
      }
      const channel = await interaction.guild.channels.fetch(cfg.portfolio_channel).catch(() => null);
      if (!channel?.isTextBased()) {
        await interaction.reply({ content: "The configured portfolio channel no longer exists — set it again.", flags: MessageFlags.Ephemeral });
        return;
      }
      const item = db.addPortfolio(guildId, name, interaction.options.getString("description", true), image, link);
      const embed = new EmbedBuilder().setTitle(name).setColor(0x5865f2).setDescription(item.description).setTimestamp();
      if (image) embed.setImage(image);
      if (link) embed.setURL(link);
      const msg = await channel.send({ embeds: [embed] });
      db.setPortfolioMessage(item.id, msg.id);
      await interaction.reply({ content: `**${name}** posted to ${channel}.`, flags: MessageFlags.Ephemeral });
    } else if (sub === "remove") {
      const name = interaction.options.getString("name", true);
      const item = db.getPortfolioItem(guildId, name);
      if (!item) {
        await interaction.reply({ content: `No project named **${name}**.`, flags: MessageFlags.Ephemeral });
        return;
      }
      const cfg = db.getConfig(guildId);
      if (item.message_id && cfg.portfolio_channel) {
        const channel = await interaction.guild.channels.fetch(cfg.portfolio_channel).catch(() => null);
        if (channel?.isTextBased()) await channel.messages.delete(item.message_id).catch(() => {});
      }
      db.removePortfolio(item.id);
      await interaction.reply({ content: `Removed **${name}**.`, flags: MessageFlags.Ephemeral });
    } else {
      const items = db.listPortfolio(guildId);
      const body = items.length
        ? items.map(p => `**${p.name}**${p.link ? ` — <${p.link}>` : ""}`).join("\n")
        : "No projects yet. Add one with `/portfolio add`.";
      await interaction.reply({ content: body, flags: MessageFlags.Ephemeral });
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    if (!interaction.inGuild()) return;
    const q = interaction.options.getFocused().toLowerCase();
    const names = db.listPortfolio(interaction.guildId)
      .map(p => p.name).filter(n => n.toLowerCase().includes(q)).slice(0, 25);
    await interaction.respond(names.map(n => ({ name: n, value: n })));
  },
};

export default portfolio;
