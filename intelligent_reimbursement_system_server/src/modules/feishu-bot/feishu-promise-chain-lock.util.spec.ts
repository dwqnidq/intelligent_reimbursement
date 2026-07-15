import { PromiseChainLock } from './feishu-promise-chain-lock.util';

describe('PromiseChainLock', () => {
  it('serializes concurrent runs for the same key', async () => {
    const lock = new PromiseChainLock();
    const order: number[] = [];
    let shared = 0;

    const first = lock.run('s1', async () => {
      expect(shared).toBe(0);
      shared = 1;
      await new Promise((r) => setTimeout(r, 30));
      order.push(1);
      return 'a';
    });

    const second = lock.run('s1', async () => {
      expect(shared).toBe(1);
      shared = 2;
      order.push(2);
      return 'b';
    });

    await expect(Promise.all([first, second])).resolves.toEqual(['a', 'b']);
    expect(order).toEqual([1, 2]);
    expect(shared).toBe(2);
  });

  it('allows different keys to run concurrently', async () => {
    const lock = new PromiseChainLock();
    let started = 0;
    let bothStarted = false;

    const a = lock.run('a', async () => {
      started += 1;
      await new Promise((r) => setTimeout(r, 20));
      if (started === 2) bothStarted = true;
      return 1;
    });
    const b = lock.run('b', async () => {
      started += 1;
      await new Promise((r) => setTimeout(r, 20));
      if (started === 2) bothStarted = true;
      return 2;
    });

    await expect(Promise.all([a, b])).resolves.toEqual([1, 2]);
    expect(bothStarted).toBe(true);
  });
});
