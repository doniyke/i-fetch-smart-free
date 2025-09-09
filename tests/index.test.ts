import { iFetchSmart } from '../src/index';
import fetch from 'node-fetch';

jest.mock('node-fetch', () => jest.fn());

const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('iFetchSmart', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it('should fetch data successfully', async () => {
    const fakeData = { message: 'hello' };
    mockedFetch.mockResolvedValue(
      new global.Response(JSON.stringify(fakeData), { status: 200 }) as any
    );

    const data = await iFetchSmart('https://api.test.com');
    expect(data).toEqual(fakeData);
  });

  it('should retry failed requests', async () => {
    const fakeData = { ok: true };
    mockedFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(
        new global.Response(JSON.stringify(fakeData), { status: 200 }) as any
      );

    const data = await iFetchSmart('https://api.test.com', { retries: 2 });
    expect(data).toEqual(fakeData);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it('should timeout requests', async () => {
    mockedFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(new global.Response('ok') as any), 2000);
        })
    );

    await expect(
      iFetchSmart('https://api.test.com', { timeout: 100 })
    ).rejects.toThrow('Timeout');
  });

  it('should cache responses', async () => {
    const fakeData = { cached: true };
    mockedFetch.mockResolvedValue(
      new global.Response(JSON.stringify(fakeData), { status: 200 }) as any
    );

    // First call → fetch
    const first = await iFetchSmart('https://api.test.com', { cacheTtl: 5000 });
    // Second call → cache
    const second = await iFetchSmart('https://api.test.com', {
      cacheTtl: 5000
    });

    expect(first).toEqual(fakeData);
    expect(second).toEqual(fakeData);
    expect(mockedFetch).toHaveBeenCalledTimes(1); // only first request
  });
});
