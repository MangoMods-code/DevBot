import {
  MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../registry.js";
import { db } from "../state.js";

const autorole: Command = {
  data: new SlashCommandBuilder()
    .setName("autorole")
    .setDescription("Automatically give new members a role")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(sub => sub.setName("set").setDescription("Turn autorole on with a role")
      .addRoleOption(o => o.setName("role").setDescription("Role for new members").setRequired(true)))
    .addSubcommand(sub => sub.setName("off").setDescription("Turn autorole off"))
    .addSubcommand(sub => sub.setName("view").setDescription("Show the current autorole")),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!interaction.inGuild() || !guild) return;
    const sub = interaction.options.getSubcommand();

    if (sub === "set") {
      const picked = interaction.options.getRole("role", true);
      const role = guild.roles.cache.get(picked.id) ?? await guild.roles.fetch(picked.id);
      const me = guild.members.me;
      if (!role || !me) return;
      if (role.id === guild.roles.everyone.id || role.managed) {
        await interaction.reply({ content: "That role can't be auto-assigned (it's @everyone or managed by an integration).", flags: MessageFlags.Ephemeral });
        return;
      }
      if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.reply({ content: "I need the **Manage Roles** permission first.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (me.roles.highest.comparePositionTo(role) <= 0) {
        await interaction.reply({ content: `My highest role must be **above** ${role} before I can hand it out. Drag my role up in Server Settings → Roles.`, flags: MessageFlags.Ephemeral });
        return;
      }
      db.setConfig(guild.id, "autorole_id", role.id);
      await interaction.reply({ content: `Autorole on — new members get ${role}.`, flags: MessageFlags.Ephemeral });
    } else if (sub === "off") {
      db.setConfig(guild.id, "autorole_id", null);
      await interaction.reply({ content: "Autorole off.", flags: MessageFlags.Ephemeral });
    } else {
      const cfg = db.getConfig(guild.id);
      await interaction.reply({
        content: cfg.autorole_id ? `Autorole is on: new members get <@&${cfg.autorole_id}>.` : "Autorole is off.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

export default autorole;
