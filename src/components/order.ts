import { MessageFlags, type ButtonInteraction } from "discord.js";
import type { Component } from "../registry.js";
import { db } from "../state.js";
import { openTicketFor } from "../lib/tickets.js";

const order: Component = {
  prefix: "order",
  async execute(interaction: ButtonInteraction) {
    const serviceId = Number(interaction.customId.split(":")[1]);
    const service = db.getServiceById(serviceId);
    if (!service) {
      await interaction.reply({ content: "That service no longer exists.", flags: MessageFlags.Ephemeral });
      return;
    }
    await openTicketFor(interaction, service);
  },
};

export default order;
