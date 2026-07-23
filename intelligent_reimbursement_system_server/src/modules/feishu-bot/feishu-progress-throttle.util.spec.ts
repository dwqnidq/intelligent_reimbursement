import { createThrottledAsyncUpdater } from './feishu-progress-throttle.util';

describe('createThrottledAsyncUpdater', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('coalesces rapid pushes and keeps the latest args', async () => {
    const calls: number[] = [];
    const updater = createThrottledAsyncUpdater(async (n: number) => {
      calls.push(n);
    }, 200);

    updater.push(1);
    updater.push(2);
    updater.push(3);
    expect(calls).toEqual([]);

    await jest.advanceTimersByTimeAsync(200);
    expect(calls).toEqual([3]);
  });

  it('flush runs the latest pending update immediately', async () => {
    const calls: number[] = [];
    const updater = createThrottledAsyncUpdater(async (n: number) => {
      calls.push(n);
    }, 500);

    updater.push(9);
    await updater.flush();
    expect(calls).toEqual([9]);
  });
});
