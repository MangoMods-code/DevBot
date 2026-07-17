import {
  MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../registry.js";

const roleall: Command = {
  data: new SlashCommandBuilder()
    .setName("roleall")
    .setDescription("Give a role to every member of the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addRoleOption(o => o.setName("role").setDescription("The role to hand out").setRequired(true))
    .addBooleanOption(o => o.setName("include_bots").setDescription("Also give it to bots (default: no)")),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!interaction.inGuild() || !guild) return;

    const picked = interaction.options.getRole("role", true);
    const role = guild.roles.cache.get(picked.id) ?? await guild.roles.fetch(picked.id);
    const me = guild.members.me;
    if (!role || !me) return;

    if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({ content: "I don't have the **Manage Roles** permission.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (role.id === guild.roles.everyone.id || role.managed) {
      await interaction.reply({ content: "That role can't be assigned manually (it's @everyone or managed by an integration).", flags: MessageFlags.Ephemeral });
      return;
    }
    if (me.roles.highest.comparePositionTo(role) <= 0) {
      await interaction.reply({ content: `My highest role must be **above** ${role} in the role list before I can assign it. Drag my role up in Server Settings → Roles.`, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const includeBots = interaction.options.getBoolean("include_bots") ?? false;
    const members = await guild.members.fetch();
    const targets = members.filter(m =>
      !m.roles.cache.has(role.id) && (includeBots || !m.user.bot)
    );
    const alreadyHad = members.size - targets.size;

    if (targets.size === 0) {
      await interaction.editReply(`Everyone already has ${role} — nothing to do.`);
      return;
    }

    let added = 0;
    let failed = 0;
    for (const member of targets.values()) {
      try {
        await member.roles.add(role, `roleall by ${interaction.user.tag}`);
        added++;
      } catch {
        failed++;
      }
      if ((added + failed) % 25 === 0) {
        await interaction.editReply(`Working… ${added + failed}/${targets.size}`).catch(() => {});
      }
    }

    const parts = [`Done — gave ${role} to **${added}** member${added === 1 ? "" : "s"}.`];
    if (alreadyHad > 0) parts.push(`${alreadyHad} already had it.`);
    if (failed > 0) parts.push(`${failed} failed (likely permissions).`);
    await interaction.editReply(parts.join(" "));
  },
};

export default roleall;
