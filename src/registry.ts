import { readdirSync } from "node:fs";
import type {
  AutocompleteInteraction, ButtonInteraction, ChatInputCommandInteraction,
  SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder,
  StringSelectMenuInteraction,
} from "discord.js";

export type ComponentInteraction = ButtonInteraction | StringSelectMenuInteraction;

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}

export interface Component {
  prefix: string;
  execute(interaction: ComponentInteraction): Promise<void>;
}

async function loadDir<T>(dir: URL): Promise<T[]> {
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return [];
  }
  const mods: T[] = [];
  for (const file of files) {
    if (!/\.(js|ts)$/.test(file) || file.endsWith(".d.ts") || file.includes(".test.")) continue;
    const mod = await import(new URL(file, dir).href);
    mods.push(mod.default as T);
  }
  return mods;
}

export async function loadCommands(): Promise<Map<string, Command>> {
  const commands = await loadDir<Command>(new URL("./commands/", import.meta.url));
  return new Map(commands.map(c => [c.data.name, c]));
}

export async function loadComponents(): Promise<Map<string, Component>> {
  const components = await loadDir<Component>(new URL("./components/", import.meta.url));
  return new Map(components.map(c => [c.prefix, c]));
}
