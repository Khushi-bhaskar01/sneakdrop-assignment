import { env } from './config/env.js';
import { createApp } from './app.js';
import { listPairs, reconcilePair } from './services/inventoryService.js';

const app = createApp();

app.listen(env.PORT, async () => {
  console.log(`SneakDrop API listening on port ${env.PORT}`);

  // Background worker to continuously reconcile pairs (expire holds, promote queue)
  setInterval(async () => {
    try {
      const pairs = await listPairs();
      for (const pair of pairs) {
        await reconcilePair(pair.id).catch(err => {
          console.error(`Error reconciling pair ${pair.id}:`, err);
        });
      }
    } catch (err) {
      console.error('Error in reconciliation worker:', err);
    }
  }, 2000); // Run every 2 seconds
});
