import {
  AttachmentBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../registry.js";
import { db } from "../state.js";
import { isImageContentType, safeImageName } from "../lib/attachments.js";

const addvouch: Command = {
  data: new SlashCommandBuilder()
    .setName("addvouch")
    .setDescription("Post a vouch on a customer's behalf (for clients not on Discord)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName("customer").setDescription("Customer's name to display").setRequired(true).setMaxLength(80))
    .addIntegerOption(o => o.setName("rating").setDescription("1-5 stars").setRequired(true).setMinValue(1).setMaxValue(5))
    .addStringOption(o => o.setName("comment").setDescription("What the customer said").setRequired(true).setMaxLength(500))
    .addStringOption(o => o.setName("service").setDescription("What they ordered (optional)").setMaxLength(100))
    .addAttachmentOption(o => o.setName("proof").setDescription("Optional screenshot of their review/text")),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) return;
    // Ack within Discord's 3-second window before any network work (channel fetch/send).
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const cfg = db.getConfig(interaction.guildId);
    if (!cfg.vouch_channel) {
      await interaction.editReply("Set a vouch channel first: `/config set setting:Vouch channel`.");
      return;
    }
    const channel = await interaction.guild.channels.fetch(cfg.vouch_channel).catch(() => null);
    if (!channel?.isTextBased()) {
      await interaction.editReply("The configured vouch channel no longer exists — set it again.");
      return;
    }

    const customer = interaction.options.getString("customer", true);
    const rating = interaction.options.getInteger("rating", true);
    const comment = interaction.options.getString("comment", true);
    const service = interaction.options.getString("service");
    const proof = interaction.options.getAttachment("proof");

    if (proof && !isImageContentType(proof.contentType)) {
      await interaction.editReply("The proof file must be an image (PNG, JPG, etc.).");
      return;
    }

    const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setAuthor({ name: customer })
      .setTitle(stars)
      .setDescription(`“${comment}”`)
      .setFooter({ text: `Verified order · submitted by ${interaction.user.username} on the customer's behalf` })
      .setTimestamp();
    if (service) embed.addFields({ name: "Service", value: service, inline: true });

    const files: AttachmentBuilder[] = [];
    if (proof) {
      const fileName = safeImageName(proof.name, proof.contentType);
      files.push(new AttachmentBuilder(proof.url, { name: fileName }));
      embed.setImage(`attachment://${fileName}`);
    }

    try {
      await channel.send({ embeds: [embed], files });
    } catch (err) {
      console.error("addvouch post failed:", err);
      await interaction.editReply("Couldn't post that — the proof image may be too large. Try a smaller file or leave it off.");
      return;
    }
    db.addManualVouch(interaction.guildId, interaction.user.id, customer, rating, comment);

    const note = proof
      ? " Heads-up: the proof screenshot is public — make sure it doesn't show the customer's phone number or address."
      : "";
    await interaction.editReply(`Posted a ${rating}★ vouch from **${customer}** in ${channel}.${note}`);
  },
};

export default addvouch;
