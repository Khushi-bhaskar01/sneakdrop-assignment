import { env } from './config/env.js';
import { createApp } from './app.js';

const app = createApp();

app.listen(env.PORT, async () => {
  console.log(`SneakDrop API listening on port ${env.PORT}`);
});
