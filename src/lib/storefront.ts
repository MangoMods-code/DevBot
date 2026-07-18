import {
  ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  type BaseMessageOptions, type Guild, type GuildTextBasedChannel,
} from "discord.js";
import { db } from "../state.js";
import type { Service } from "../db.js";
import { chunkServices, menuOptionDescription } from "./storefrontLayout.js";

const GREEN = 0x57f287;

function buildMessages(services: Service[]): BaseMessageOptions[] {
  if (services.length === 0) {
    return [{
      embeds: [new EmbedBuilder()
        .setColor(GREEN)
        .setTitle("🛠️ Services")
        .setDescription("Nothing listed yet — check back soon.")],
      components: [],
    }];
  }

  const chunks = chunkServices(services);
  return chunks.map((chunk, i) => {
    const first = i === 0;
    const last = i === chunks.length - 1;

    const embed = new EmbedBuilder()
      .setColor(GREEN)
      .setTitle(first ? "🛠️ Services" : `🛠️ Services — continued (${i + 1}/${chunks.length})`);
    if (first) {
      embed.setDescription(
        "Pick a service from the menu below and a **private order ticket** opens just for you — " +
        "no forms, no DMs, no pressure. Prices ending in `+` are starting points; " +
        "your exact quote depends on the job."
      );
    }
    for (const s of chunk) {
      embed.addFields({ name: `${s.name}  ·  ${s.price}`, value: s.description });
    }
    if (last) {
      embed.setFooter({ text: "Payment is arranged inside your ticket · vouches come from real orders only" });
      embed.setTimestamp();
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId("ordermenu")
      .setPlaceholder("🛒 Choose a service to order…")
      .addOptions(chunk.map(s =>
        new StringSelectMenuOptionBuilder()
          .setLabel(s.name.slice(0, 100))
          .setDescription(menuOptionDescription(s.price, s.description))
          .setValue(String(s.id))
      ));

    return {
      embeds: [embed],
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    };
  });
}

async function deleteStoredMessages(guild: Guild): Promise<void> {
  const stored = db.getStorefront(guild.id);
  if (!stored) return;
  const channel = await guild.channels.fetch(stored.channel_id).catch(() => null);
  if (!channel?.isTextBased()) return;
  for (const id of stored.message_ids) {
    await channel.messages.delete(id).catch(() => {});
  }
}

export async function postStorefront(guild: Guild, channel: GuildTextBasedChannel): Promise<void> {
  await deleteStoredMessages(guild);
  const ids: string[] = [];
  for (const payload of buildMessages(db.listServices(guild.id))) {
    const msg = await channel.send(payload);
    ids.push(msg.id);
  }
  db.setStorefront(guild.id, channel.id, ids);
}

export async function refreshStorefront(guild: Guild): Promise<void> {
  const stored = db.getStorefront(guild.id);
  if (!stored) return;
  const channel = await guild.channels.fetch(stored.channel_id).catch(() => null);
  if (!channel?.isTextBased()) return;

  const payloads = buildMessages(db.listServices(guild.id));

  // Same number of messages → edit in place so the storefront doesn't jump to the bottom.
  if (payloads.length === stored.message_ids.length) {
    const messages = [];
    for (const id of stored.message_ids) {
      const m = await channel.messages.fetch(id).catch(() => null);
      if (!m) break;
      messages.push(m);
    }
    if (messages.length === payloads.length) {
      for (let i = 0; i < payloads.length; i++) {
        await messages[i].edit(payloads[i]);
      }
      return;
    }
  }

  // Message count changed (or something was deleted) → repost cleanly.
  await deleteStoredMessages(guild);
  const ids: string[] = [];
  for (const payload of payloads) {
    const msg = await channel.send(payload);
    ids.push(msg.id);
  }
  db.setStorefront(guild.id, channel.id, ids);
}
