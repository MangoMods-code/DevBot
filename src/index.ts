import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { loadCommands, loadComponents } from "./registry.js";
import { handleMemberAdd } from "./events/guildMemberAdd.js";
import { handleMemberUpdate } from "./events/guildMemberUpdate.js";
import { handleMessage } from "./events/messageCreate.js";
import { startCounterTimer, updateGuildCounters } from "./lib/counterService.js";

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN is not set");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const commands = await loadCommands();
const components = await loadComponents();

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  const data = [...commands.values()].map(cmd => cmd.data.toJSON());
  const guildId = process.env.GUILD_ID;
  if (guildId) {
    const guild = await c.guilds.fetch(guildId);
    await guild.commands.set(data);
    console.log(`Registered ${data.length} guild commands in ${guild.name}`);
  } else {
    await c.application.commands.set(data);
    console.log(`Registered ${data.length} global commands`);
  }
  for (const guild of c.guilds.cache.values()) {
    await guild.members.fetch().catch(err => console.error(`member fetch failed for ${guild.id}:`, err));
    await updateGuildCounters(guild).catch(err => console.error("initial counters failed:", err));
  }
  startCounterTimer(c);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await commands.get(interaction.commandName)?.execute(interaction);
    } else if (interaction.isAutocomplete()) {
      await commands.get(interaction.commandName)?.autocomplete?.(interaction);
    } else if (interaction.isButton()) {
      await components.get(interaction.customId.split(":")[0])?.execute(interaction);
    }
  } catch (err) {
    console.error("interaction error:", err);
    if (interaction.isRepliable()) {
      const payload = { content: "Something went wrong. Try again or ping an admin.", flags: MessageFlags.Ephemeral } as const;
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
    }
  }
});

client.on(Events.GuildMemberAdd, (member) => {
  handleMemberAdd(member).catch(err => console.error("welcome failed:", err));
  updateGuildCounters(member.guild).catch(err => console.error("counters failed:", err));
});

client.on(Events.MessageCreate, (message) => {
  handleMessage(message).catch(err => console.error("automod failed:", err));
});

client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
  handleMemberUpdate(oldMember, newMember).catch(err => console.error("boost notify failed:", err));
});

client.on(Events.GuildMemberRemove, (member) => {
  updateGuildCounters(member.guild).catch(err => console.error("counters failed:", err));
});

client.login(token);
