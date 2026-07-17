import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder,
  MessageFlags, PermissionFlagsBits,
  type ButtonInteraction, type ChatInputCommandInteraction,
} from "discord.js";
import { db } from "../state.js";
import type { Service } from "../db.js";

export async function openTicketFor(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  service: Service,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const cfg = db.getConfig(guild.id);
  if (!cfg.ticket_category) {
    await interaction.reply({
      content: "Tickets aren't set up yet — an admin needs to run `/config set setting:Ticket category`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const existing = db.getOpenTicketByUser(guild.id, interaction.user.id);
  if (existing) {
    await interaction.reply({
      content: `You already have an open ticket: <#${existing.channel_id}>`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "user";
  const channel = await guild.channels.create({
    name: `ticket-${safeName}`,
    type: ChannelType.GuildText,
    parent: cfg.ticket_category,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: guild.members.me!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
    ],
  });

  db.openTicket(guild.id, channel.id, interaction.user.id, service.name, service.price);

  const embed = new EmbedBuilder()
    .setTitle(`Order: ${service.name}`)
    .setColor(0x57f287)
    .addFields(
      { name: "Service", value: service.name, inline: true },
      { name: "Price", value: service.price, inline: true },
      { name: "Client", value: `<@${interaction.user.id}>`, inline: true },
    )
    .setDescription("Describe what you need — requirements, deadline, budget. Payment is arranged manually in this channel.")
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("closeticket").setLabel("Close Ticket").setStyle(ButtonStyle.Danger),
  );

  await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });
  await interaction.editReply(`Ticket opened: ${channel}`);
}
