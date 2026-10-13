import 'dotenv/config';
import { createApp } from './app.js';
import { getChatConfig, hasApiCredentials } from './lib/config.js';

const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT) || 3001;

const app = createApp({ serveStatic: isProduction });

app.listen(port, () => {
  console.log(`[server] Lumen Chat API listening on http://localhost:${port} (${isProduction ? 'production' : 'development'})`);
  console.log(`[server] Model: ${getChatConfig().model}`);
  if (!hasApiCredentials()) {
    console.warn('[server] ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.');
  }
});
