import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { Command } from "../registry.js";
import { db } from "../state.js";
import { openTicketFor } from "../lib/tickets.js";
import { serviceNameAutocomplete } from "../lib/autocomplete.js";

const order: Command = {
  data: new SlashCommandBuilder()
    .setName("order")
    .setDescription("Open an order ticket for a service")
    .addStringOption(o => o.setName("service").setDescription("The service you want").setRequired(true).setAutocomplete(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) return;
    const name = interaction.options.getString("service", true);
    const service = db.getService(interaction.guildId, name);
    if (!service) {
      await interaction.reply({ content: `No service named **${name}** — pick one from the autocomplete list.`, flags: MessageFlags.Ephemeral });
      return;
    }
    await openTicketFor(interaction, service);
  },

  autocomplete: serviceNameAutocomplete,
};

export default order;
