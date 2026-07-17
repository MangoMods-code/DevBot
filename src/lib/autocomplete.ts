import type { AutocompleteInteraction } from "discord.js";
import { db } from "../state.js";

export async function serviceNameAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.inGuild()) return;
  const q = interaction.options.getFocused().toLowerCase();
  const names = db.listServices(interaction.guildId)
    .map(s => s.name)
    .filter(n => n.toLowerCase().includes(q))
    .slice(0, 25);
  await interaction.respond(names.map(n => ({ name: n, value: n })));
}
