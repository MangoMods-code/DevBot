import {
  EmbedBuilder, MessageFlags, SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../registry.js";
import { db } from "../state.js";

const vouch: Command = {
  data: new SlashCommandBuilder()
    .setName("vouch")
    .setDescription("Leave a review after a completed order")
    .addIntegerOption(o => o.setName("rating").setDescription("1-5 stars").setRequired(true).setMinValue(1).setMaxValue(5))
    .addStringOption(o => o.setName("comment").setDescription("How did it go?").setRequired(true).setMaxLength(500)),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) return;
    const guildId = interaction.guildId;

    const cfg = db.getConfig(guildId);
    if (!cfg.vouch_channel) {
      await interaction.reply({ content: "Vouches aren't set up yet — an admin needs to run `/config set setting:Vouch channel`.", flags: MessageFlags.Ephemeral });
      return;
    }
    const ticket = db.getUnvouchedClosedTicket(guildId, interaction.user.id);
    if (!ticket) {
      await interaction.reply({ content: "Vouches are reserved for clients with a completed order ticket.", flags: MessageFlags.Ephemeral });
      return;
    }
    const channel = await interaction.guild.channels.fetch(cfg.vouch_channel).catch(() => null);
    if (!channel?.isTextBased()) {
      await interaction.reply({ content: "The configured vouch channel no longer exists — an admin needs to set it again.", flags: MessageFlags.Ephemeral });
      return;
    }

    const rating = interaction.options.getInteger("rating", true);
    const comment = interaction.options.getString("comment", true);
    db.addVouch(guildId, interaction.user.id, ticket.id, rating, comment);
    db.markVouched(ticket.id);

    const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
    const embed = new EmbedBuilder()
      .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
      .setColor(0xfee75c)
      .setTitle(stars)
      .setDescription(comment)
      .addFields({ name: "Service", value: ticket.service_name, inline: true })
      .setTimestamp();
    await channel.send({ embeds: [embed] });
    await interaction.reply({ content: "Thanks for the vouch!", flags: MessageFlags.Ephemeral });
  },
};

export default vouch;
