export function isAssistantChatEnabled() {
  return process.env.NODE_ENV !== "production";
}
