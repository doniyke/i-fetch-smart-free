# I-Fetch-Smart

A smarter `fetch` wrapper for Node.js and modern JavaScript apps.  
Includes **retries with exponential backoff, timeouts, and simple in-memory caching** — all in one tiny utility.

---

## ✨ Features

- ✅ Retry failed requests with exponential backoff
- ⏱️ Timeout handling to avoid hanging requests
- 💾 Simple in-memory caching with TTL
- 🧹 Clean `fetch` wrapper with TypeScript support
- 🔧 Plug-and-play, no extra config needed

---

## 📦 Installation

### NPM

```bash
npm install i-fetch-smart

```

### YARN

```bash
yarn add i-fetch-smart
```

## 🚀 Usage

```
import { iFetchSmart } from "i-fetch-smart";

async function main() {
  try {
    const data = await iFetchSmart("https://jsonplaceholder.typicode.com/posts/1", {
      retries: 3,      // number of retries (default: 3)
      timeout: 5000,   // timeout in ms (default: 5000)
      cacheTtl: 10000, // cache for 10s (default: 0 = disabled)
    });

    console.log(data);
  } catch (err) {
    console.error("Request failed:", err);
  }
}

main();

```

## ⚙️ Options

| Option     | Type          | Default | Description                                               |
| ---------- | ------------- | ------- | --------------------------------------------------------- |
| `retries`  | `number`      | `3`     | Number of retry attempts for failed requests              |
| `timeout`  | `number`      | `5000`  | Timeout in milliseconds before aborting                   |
| `cacheTtl` | `number`      | `0`     | Cache time in ms (0 = disabled)                           |
| ...others  | `RequestInit` | -       | All native fetch options like `method`, `headers`, `body` |

## 🧪 Example: POST Request

```
const newPost = await iFetchSmart("https://jsonplaceholder.typicode.com/posts", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "Hello", body: "World", userId: 1 }),
  retries: 2,
  timeout: 3000,
});

console.log(newPost);

```

## 🧰 Development

```
git clone https://github.com/your-username/i-fetch-smart.git
cd i-fetch-smart
npm install

```

## Build:

```
npm run build
```

## Test:

```
npm test
```

## 📜 License

### MIT
