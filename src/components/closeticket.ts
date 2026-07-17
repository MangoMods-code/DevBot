import {
  AttachmentBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits,
  type ButtonInteraction, type Message, type TextChannel,
} from "discord.js";
import type { Component } from "../registry.js";
import { db } from "../state.js";
import { buildTranscript, type TranscriptMessage } from "../lib/transcript.js";

async function fetchAllMessages(channel: TextChannel): Promise<TranscriptMessage[]> {
  const all: Message[] = [];
  let before: string | undefined;
  for (;;) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;
    all.push(...batch.values());
    before = batch.last()!.id;
    if (batch.size < 100) break;
  }
  return all
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map(m => ({ author: m.author.tag, content: m.content || "(embed/attachment)", createdAt: m.createdAt }));
}

const closeticket: Component = {
  prefix: "closeticket",
  async execute(interaction: ButtonInteraction) {
    const guild = interaction.guild;
    if (!guild || !interaction.channel) return;

    const ticket = db.getTicketByChannel(interaction.channel.id);
    if (!ticket || ticket.status === "closed") {
      await interaction.reply({ content: "This channel isn't an open ticket.", flags: MessageFlags.Ephemeral });
      return;
    }
    const isOwner = interaction.user.id === ticket.user_id;
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
    if (!isOwner && !isAdmin) {
      await interaction.reply({ content: "Only the ticket owner or an admin can close this.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply("Closing ticket and saving transcript…");

    const messages = await fetchAllMessages(interaction.channel as TextChannel);
    const transcript = buildTranscript(messages);
    db.closeTicket(ticket.id, transcript);

    const cfg = db.getConfig(guild.id);
    if (cfg.transcript_channel) {
      const target = await guild.channels.fetch(cfg.transcript_channel).catch(() => null);
      if (target?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle(`Ticket closed: ${ticket.service_name}`)
          .setColor(0xed4245)
          .addFields(
            { name: "Client", value: `<@${ticket.user_id}>`, inline: true },
            { name: "Price", value: ticket.price, inline: true },
            { name: "Closed by", value: `<@${interaction.user.id}>`, inline: true },
          )
          .setTimestamp();
        const file = new AttachmentBuilder(Buffer.from(transcript, "utf8"), { name: `ticket-${ticket.id}.txt` });
        await target.send({ embeds: [embed], files: [file] }).catch(err => console.error("transcript post failed:", err));
      }
    }

    await interaction.channel.delete().catch(err => console.error("channel delete failed:", err));
  },
};

export default closeticket;
