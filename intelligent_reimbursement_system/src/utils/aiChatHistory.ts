export function resolveAiChatUserId(
  user: { id?: string } | null | undefined,
): string | null {
  const id = user?.id?.trim();
  return id ? id : null;
}

export function canPersistAiChatHistory(opts: {
  historyLoaded: boolean;
  activeUserId: string | null;
  writingUserId: string | null;
}): boolean {
  if (!opts.historyLoaded) return false;
  if (!opts.activeUserId || !opts.writingUserId) return false;
  return opts.activeUserId === opts.writingUserId;
}
