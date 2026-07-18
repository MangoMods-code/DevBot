import { MessageFlags } from "discord.js";
import type { Component, ComponentInteraction } from "../registry.js";
import { db } from "../state.js";
import { openTicketFor } from "../lib/tickets.js";

const ordermenu: Component = {
  prefix: "ordermenu",
  async execute(interaction: ComponentInteraction) {
    if (!interaction.isStringSelectMenu()) return;
    const serviceId = Number(interaction.values[0]);
    const service = db.getServiceById(serviceId);
    if (!service) {
      await interaction.reply({ content: "That service no longer exists — the menu may be stale.", flags: MessageFlags.Ephemeral });
      return;
    }
    await openTicketFor(interaction, service);
    // Re-render the menu so the picked option doesn't stay visually selected.
    await interaction.message.edit({ components: interaction.message.components }).catch(() => {});
  },
};

export default ordermenu;
