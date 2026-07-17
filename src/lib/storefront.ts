import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  type Guild, type GuildTextBasedChannel,
} from "discord.js";
import { db } from "../state.js";
import type { Service } from "../db.js";

const MAX_BUTTONS = 25; // 5 rows x 5 buttons

function buildStorefront(services: Service[]) {
  const embed = new EmbedBuilder()
    .setTitle("🛠️ Services")
    .setColor(0x57f287)
    .setDescription(
      services.length
        ? services.map(s => `**${s.name}** — \`${s.price}\`\n${s.description}`).join("\n\n")
        : "No services listed yet."
    )
    .setFooter({ text: "Click a button below to open an order ticket" });

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < Math.min(services.length, MAX_BUTTONS); i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      services.slice(i, i + 5).map(s =>
        new ButtonBuilder()
          .setCustomId(`order:${s.id}`)
          .setLabel(`Order: ${s.name}`.slice(0, 80))
          .setStyle(ButtonStyle.Primary)
      )
    ));
  }
  return { embeds: [embed], components: rows };
}

export async function postStorefront(guild: Guild, channel: GuildTextBasedChannel): Promise<void> {
  const existing = db.getStorefront(guild.id);
  if (existing) {
    const oldChannel = await guild.channels.fetch(existing.channel_id).catch(() => null);
    if (oldChannel?.isTextBased()) {
      await oldChannel.messages.delete(existing.message_id).catch(() => {});
    }
  }
  const msg = await channel.send(buildStorefront(db.listServices(guild.id)));
  db.setStorefront(guild.id, channel.id, msg.id);
}

export async function refreshStorefront(guild: Guild): Promise<void> {
  const stored = db.getStorefront(guild.id);
  if (!stored) return;
  const channel = await guild.channels.fetch(stored.channel_id).catch(() => null);
  if (!channel?.isTextBased()) return;
  const msg = await channel.messages.fetch(stored.message_id).catch(() => null);
  if (!msg) return;
  await msg.edit(buildStorefront(db.listServices(guild.id)));
}
