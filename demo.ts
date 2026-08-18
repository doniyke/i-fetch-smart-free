/**
 * Runnable demo against a public API. Run with:
 *   npx ts-node demo.ts
 */
import { iFetchSmart, isFetchSmartError } from './src/index';

type Todo = {
  userId: number;
  id: number;
  title: string;
  completed: boolean;
};

(async () => {
  try {
    const todo = await iFetchSmart<Todo>(
      'https://jsonplaceholder.typicode.com/todos/1',
      {
        retries: 2,
        timeout: 3000,
        cacheTtl: 10_000
      }
    );

    console.log('Fetched:', todo.title);

    // Served from cache — no second request.
    const again = await iFetchSmart<Todo>(
      'https://jsonplaceholder.typicode.com/todos/1',
      { cacheTtl: 10_000 }
    );
    console.log('Cached: ', again.title);
  } catch (error) {
    if (!isFetchSmartError(error)) throw error;

    console.error(
      `Request failed [${error.code}]`,
      error.status ? `status ${error.status}` : '',
      `after ${error.attempts} attempt(s)`
    );
    process.exitCode = 1;
  }
})();
