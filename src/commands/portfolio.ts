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
    // Ack within Discord's 3-second window before any network work (channel fetch/send).
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === "add") {
      const cfg = db.getConfig(guildId);
      if (!cfg.portfolio_channel) {
        await interaction.editReply("Set a portfolio channel first: `/config set setting:Portfolio channel`.");
        return;
      }
      const name = interaction.options.getString("name", true);
      if (db.getPortfolioItem(guildId, name)) {
        await interaction.editReply(`A project named **${name}** already exists. Remove it first with \`/portfolio remove\` if you want to re-add it.`);
        return;
      }
      const image = interaction.options.getString("image");
      const link = interaction.options.getString("link");
      if ((image && !isHttpUrl(image)) || (link && !isHttpUrl(link))) {
        await interaction.editReply("Image and link must be full `https://` URLs.");
        return;
      }
      const channel = await interaction.guild.channels.fetch(cfg.portfolio_channel).catch(() => null);
      if (!channel?.isTextBased()) {
        await interaction.editReply("The configured portfolio channel no longer exists — set it again.");
        return;
      }
      const description = interaction.options.getString("description", true);
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(name)
        .setDescription(description)
        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() ?? undefined })
        .setTimestamp();
      if (link) {
        embed.setURL(link);
        embed.addFields({ name: "🔗 Link", value: `[Open project](${link})` });
      }
      if (image) embed.setImage(image);
      // Post first; only record it in the DB once Discord accepts the message.
      const msg = await channel.send({ embeds: [embed] });
      const item = db.addPortfolio(guildId, name, description, image, link);
      db.setPortfolioMessage(item.id, msg.id);
      await interaction.editReply(`**${name}** posted to ${channel}.`);
    } else if (sub === "remove") {
      const name = interaction.options.getString("name", true);
      const item = db.getPortfolioItem(guildId, name);
      if (!item) {
        await interaction.editReply(`No project named **${name}**.`);
        return;
      }
      const cfg = db.getConfig(guildId);
      if (item.message_id && cfg.portfolio_channel) {
        const channel = await interaction.guild.channels.fetch(cfg.portfolio_channel).catch(() => null);
        if (channel?.isTextBased()) await channel.messages.delete(item.message_id).catch(() => {});
      }
      db.removePortfolio(item.id);
      await interaction.editReply(`Removed **${name}**.`);
    } else {
      const items = db.listPortfolio(guildId);
      const body = items.length
        ? items.map(p => `**${p.name}**${p.link ? ` — <${p.link}>` : ""}`).join("\n")
        : "No projects yet. Add one with `/portfolio add`.";
      await interaction.editReply(body);
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
