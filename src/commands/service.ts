import {
  EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../registry.js";
import { db } from "../state.js";
import { serviceNameAutocomplete } from "../lib/autocomplete.js";
import { refreshStorefront } from "../lib/storefront.js";

const service: Command = {
  data: new SlashCommandBuilder()
    .setName("service")
    .setDescription("Manage the services you sell")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub.setName("add").setDescription("Add a service")
      .addStringOption(o => o.setName("name").setDescription("Service name").setRequired(true).setMaxLength(80))
      .addStringOption(o => o.setName("price").setDescription("Price, e.g. $50+").setRequired(true).setMaxLength(30))
      .addStringOption(o => o.setName("description").setDescription("What the client gets").setRequired(true).setMaxLength(200)))
    .addSubcommand(sub => sub.setName("edit").setDescription("Edit a service's price/description")
      .addStringOption(o => o.setName("name").setDescription("Service to edit").setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName("price").setDescription("New price").setMaxLength(30))
      .addStringOption(o => o.setName("description").setDescription("New description").setMaxLength(200)))
    .addSubcommand(sub => sub.setName("remove").setDescription("Remove a service")
      .addStringOption(o => o.setName("name").setDescription("Service to remove").setRequired(true).setAutocomplete(true)))
    .addSubcommand(sub => sub.setName("list").setDescription("List all services")),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) return;
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === "add") {
      const name = interaction.options.getString("name", true);
      if (db.getService(guildId, name)) {
        await interaction.reply({ content: `A service named **${name}** already exists.`, flags: MessageFlags.Ephemeral });
        return;
      }
      db.addService(guildId, name,
        interaction.options.getString("price", true),
        interaction.options.getString("description", true));
      await interaction.reply({ content: `Added service **${name}**.`, flags: MessageFlags.Ephemeral });
      if (interaction.guild) await refreshStorefront(interaction.guild);
    } else if (sub === "edit") {
      const name = interaction.options.getString("name", true);
      const existing = db.getService(guildId, name);
      if (!existing) {
        await interaction.reply({ content: `No service named **${name}**.`, flags: MessageFlags.Ephemeral });
        return;
      }
      db.updateService(existing.id,
        interaction.options.getString("price") ?? existing.price,
        interaction.options.getString("description") ?? existing.description);
      await interaction.reply({ content: `Updated **${name}**.`, flags: MessageFlags.Ephemeral });
      if (interaction.guild) await refreshStorefront(interaction.guild);
    } else if (sub === "remove") {
      const name = interaction.options.getString("name", true);
      const existing = db.getService(guildId, name);
      if (!existing) {
        await interaction.reply({ content: `No service named **${name}**.`, flags: MessageFlags.Ephemeral });
        return;
      }
      db.removeService(existing.id);
      await interaction.reply({ content: `Removed **${name}**.`, flags: MessageFlags.Ephemeral });
      if (interaction.guild) await refreshStorefront(interaction.guild);
    } else {
      const services = db.listServices(guildId);
      if (!services.length) {
        await interaction.reply({ content: "No services yet. Add one with `/service add`.", flags: MessageFlags.Ephemeral });
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(`Services (${services.length})`);
      for (const s of services.slice(0, 25)) {
        embed.addFields({ name: `${s.name}  ·  ${s.price}`, value: s.description });
      }
      if (services.length > 25) embed.setFooter({ text: `…and ${services.length - 25} more (the storefront shows them all)` });
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },

  autocomplete: serviceNameAutocomplete,
};

export default service;
