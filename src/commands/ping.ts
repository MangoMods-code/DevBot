import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { Command } from "../registry.js";

const started = Date.now();

const ping: Command = {
  data: new SlashCommandBuilder().setName("ping").setDescription("Bot latency and uptime"),
  async execute(interaction: ChatInputCommandInteraction) {
    const uptimeMin = Math.floor((Date.now() - started) / 60000);
    await interaction.reply({
      content: `Pong! Latency: ${interaction.client.ws.ping}ms · Uptime: ${uptimeMin}m`,
    });
  },
};

export default ping;
