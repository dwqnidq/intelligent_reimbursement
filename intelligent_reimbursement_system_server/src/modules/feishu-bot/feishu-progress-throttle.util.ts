/** 节流异步更新：合并高频调用，保证最后一次会执行。 */
export function createThrottledAsyncUpdater<TArgs extends unknown[]>(
  update: (...args: TArgs) => Promise<void>,
  intervalMs: number,
): {
  push: (...args: TArgs) => void;
  flush: () => Promise<void>;
} {
  let latest: TArgs | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> = Promise.resolve();
  let pendingAfterFlight = false;

  const run = async () => {
    timer = null;
    if (!latest) return;
    const args = latest;
    latest = null;
    inFlight = update(...args).catch(() => undefined);
    await inFlight;
    if (pendingAfterFlight && latest) {
      pendingAfterFlight = false;
      await run();
    }
  };

  return {
    push(...args: TArgs) {
      latest = args;
      if (timer != null) return;
      if (intervalMs <= 0) {
        void run();
        return;
      }
      timer = setTimeout(() => {
        void run();
      }, intervalMs);
    },
    async flush() {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      pendingAfterFlight = true;
      await inFlight;
      if (latest) {
        pendingAfterFlight = false;
        await run();
      }
      pendingAfterFlight = false;
      await inFlight;
    },
  };
}
