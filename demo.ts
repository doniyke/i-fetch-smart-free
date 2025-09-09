import { iFetchSmart } from './src/index';

(async () => {
  try {
    const data = await iFetchSmart(
      'https://jsonplaceholder.typicode.com/todos/1',
      {
        retries: 2,
        timeout: 3000,
        cacheTtl: 10000
      }
    );
    console.log('Fetched Data:', data);
  } catch (error) {
    console.error('Fetch failed:', error);
  }
})();
