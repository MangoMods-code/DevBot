export const DEFAULT_WELCOME = "Welcome to the server, {user}! Check out the storefront to see what we offer.";

export function renderWelcome(template: string, mention: string): string {
  return template.replaceAll("{user}", mention);
}
