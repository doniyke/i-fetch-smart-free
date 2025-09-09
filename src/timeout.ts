export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number = 5000
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });

  return Promise.race([promise, timeout]).finally(() =>
    clearTimeout(timer!)
  ) as Promise<T>;
}
