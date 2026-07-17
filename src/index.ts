import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { loadCommands, loadComponents } from "./registry.js";

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
  }
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

client.login(token);
