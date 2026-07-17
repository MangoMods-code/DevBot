import { EmbedBuilder, type Guild, type GuildTextBasedChannel } from "discord.js";
import { db } from "../state.js";

const GREEN = 0x57f287;
const CHARCOAL = 0x2b2d31;

export function buildRulesEmbeds(guild: Guild): EmbedBuilder[] {
  const header = new EmbedBuilder()
    .setColor(GREEN)
    .setAuthor({ name: guild.name, iconURL: guild.iconURL({ size: 128 }) ?? undefined })
    .setTitle("📜 The Rules")
    .setDescription(
      "Welcome to the shop. The vibe here is simple: **be cool, keep it legal, and don't make " +
      "the mods work overtime.** Reading this takes two minutes and saves everyone a headache.\n\n" +
      "Being in this server means you agree to everything below — \"I didn't read them\" isn't a defense."
    );

  const conduct = new EmbedBuilder()
    .setColor(CHARCOAL)
    .setTitle("🤝 Respect & Conduct")
    .setDescription([
      "**1. Respect everyone.** Banter and roasting between friends is fine — harassment, hate speech, " +
      "slurs, or repeatedly targeting someone is not. Bigotry skips every warning and goes straight to a ban.",
      "**2. No drama imports.** Beef from other servers, DMs, or games stays at the door. " +
      "We are not the courtroom for it.",
      "**3. No doxxing, ever.** Posting anyone's real-life info — name, face, address, socials — without " +
      "their say-so gets removed and almost certainly gets you banned. This includes \"jokingly.\"",
      "**4. Listen to staff.** If a mod says drop it, drop it. Think a call was wrong? DM them and " +
      "make your case — arguing it out in public chat just turns a warning into a timeout.",
    ].join("\n\n"));

  const content = new EmbedBuilder()
    .setColor(CHARCOAL)
    .setTitle("💬 Chat & Content")
    .setDescription([
      "**5. Keep it SFW.** No NSFW/NSFL content, links, usernames, or profile pics. " +
      "\"It's technically censored\" still counts.",
      "**6. No spam.** No flooding, mass pings, copypasta walls, or ghost-pinging. " +
      "`@everyone` belongs to staff — treat pinging them like pulling a fire alarm.",
      "**7. Use the right channels.** Memes in memes, questions in help, orders in tickets. " +
      "You'll get redirected once; after that it just gets deleted.",
      "**8. No shady links.** IP grabbers, token stealers, \"free nitro,\" crypto pump schemes, " +
      "or anything that smells like malware = instant ban, no appeal. We're a dev server; we can tell.",
    ].join("\n\n"));

  const business = new EmbedBuilder()
    .setColor(CHARCOAL)
    .setTitle("💼 Business & Orders")
    .setDescription([
      "**9. All orders go through tickets.** If someone DMs you offering \"the same service but cheaper,\" " +
      "it's a scam 100% of the time. Report it, don't test it.",
      "**10. No fake vouches.** Vouches come from real, completed orders only. Faking one — or asking " +
      "someone to — is a ban for everyone involved. The vouch channel only works if it's honest.",
      "**11. Payment issues get handled in your ticket,** not in public chat. Filing a chargeback instead " +
      "of talking to us first = ban + blacklist. We're reasonable people; use the ticket.",
      "**12. Don't poach.** No advertising your own services or servers here, and no cold-DMing members " +
      "with offers. One unsolicited ad is all it takes.",
    ].join("\n\n"));

  const enforcement = new EmbedBuilder()
    .setColor(CHARCOAL)
    .setTitle("🔨 How Enforcement Actually Works")
    .setDescription([
      "We're not out here waiting to punish people. Here's the honest ladder:",
      "• **Minor slip-up** → a friendly heads-up. Happens to everyone, no record kept.",
      "• **Repeat or deliberate** → a formal warning. **Three warnings = 24h timeout.**",
      "• **Keep going** → timeouts escalate: 24 hours → 7 days → ban.",
      "• **Severe stuff** (hate, doxxing, scams, malware, NSFW) skips the ladder entirely → **instant ban.**",
      "",
      "**Clean slate:** warnings older than 60 days stop counting against you.",
      "**Appeals:** DM an admin with your side. Calm cases get heard; rants get archived.",
      "Staff have final say — we promise to use it fairly, and that promise is the whole system.",
    ].join("\n"));

  const footer = new EmbedBuilder()
    .setColor(GREEN)
    .setTitle("✅ TL;DR")
    .setDescription(
      "Be decent, keep it clean, do business in tickets, don't scam anyone. That's genuinely the " +
      "whole vibe — the long version above only exists so nobody can say they didn't know.\n\n" +
      "Now go have fun. 🥭"
    )
    .setFooter({ text: "Staying in the server counts as agreeing to these rules." })
    .setTimestamp();

  return [header, conduct, content, business, enforcement, footer];
}

export async function postRules(guild: Guild, channel: GuildTextBasedChannel): Promise<void> {
  const existing = db.getRulesMessages(guild.id);
  if (existing) {
    const oldChannel = await guild.channels.fetch(existing.channel_id).catch(() => null);
    if (oldChannel?.isTextBased()) {
      for (const id of existing.message_ids) {
        await oldChannel.messages.delete(id).catch(() => {});
      }
    }
  }
  const msg = await channel.send({ embeds: buildRulesEmbeds(guild) });
  db.setRulesMessages(guild.id, channel.id, [msg.id]);
}
