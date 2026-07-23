import { mapWithConcurrency } from './feishu-concurrency.util';

describe('mapWithConcurrency', () => {
  it('preserves order and respects concurrency', async () => {
    let running = 0;
    let maxRunning = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 20));
      running -= 1;
      return n * 10;
    });
    expect(result).toEqual([10, 20, 30, 40]);
    expect(maxRunning).toBeLessThanOrEqual(2);
  });
});
