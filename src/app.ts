import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { dbPool } from './db/pool.js';
import { createUser, getUserById } from './services/usersService.js';
import { countUserActiveHolds, countUserPurchases, createActiveHold, listPairs, reconcilePair, getUserStatus } from './services/inventoryService.js';
import { handlePaymentEvent } from './services/paymentService.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/health', async (_req: Request, res: Response) => {
    try {
      await dbPool.query('SELECT 1');
      res.status(200).json({
        status: 'ok',
        service: 'sneakdrop-assignment',
        nodeEnv: env.NODE_ENV,
        timestamp: new Date().toISOString(),
        db: 'connected',
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        service: 'sneakdrop-assignment',
        error: error instanceof Error ? error.message : 'Database unavailable',
      });
    }
  });

  app.get('/', (_req: Request, res: Response) => {
    res.json({
      service: 'sneakdrop-assignment',
      message: 'Sneaker drop API is running.',
    });
  });

  app.post('/users', async (req: Request, res: Response) => {
    const { email } = req.body as { email?: string };

    try {
      const user = await createUser(email ?? '');
      res.status(201).json({ user });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid user request' });
    }
  });

  app.get('/users/:userId/status', async (req: Request, res: Response) => {
    try {
      const status = await getUserStatus(req.params.userId as string);
      res.json(status);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Could not get status' });
    }
  });

  app.get('/inventory', async (_req: Request, res: Response) => {
    const pairs = await listPairs();
    res.json({ pairs });
  });

  app.post('/inventory/:pairId/reconcile', async (req: Request, res: Response) => {
    const pairId = Number(req.params.pairId);

    try {
      const result = await reconcilePair(pairId);
      res.json(result);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Could not reconcile pair',
      });
    }
  });

  app.post('/holds', async (req: Request, res: Response) => {
    const { userId, pairId } = req.body as { userId?: string; pairId?: number };

    if (!userId || !pairId) {
      res.status(400).json({ error: 'userId and pairId are required.' });
      return;
    }

    try {
      const user = await getUserById(userId);
      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      const activeHoldCount = await countUserActiveHolds(userId);
      if (activeHoldCount >= 1) {
        res.status(409).json({ error: 'User already has an active hold.' });
        return;
      }

      const purchaseCount = await countUserPurchases(userId);
      if (purchaseCount >= 2) {
        res.status(409).json({ error: 'User has already reached the max of 2 purchases.' });
        return;
      }

      const result = await createActiveHold(userId, Number(pairId));

      if ('status' in result && (result.status === 'queued' || result.status === 'out_of_stock')) {
        res.status(202).json(result);
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Could not create hold',
      });
    }
  });

  app.post('/payments/webhook', async (req: Request, res: Response) => {
    const event = req.body as {
      providerEventId?: string;
      userId?: string;
      holdId?: string;
      eventType?: 'payment.succeeded' | 'payment.failed';
      amountCents?: number;
      payload?: Record<string, unknown>;
    };

    if (!event.providerEventId || !event.userId || !event.eventType) {
      res.status(400).json({ error: 'providerEventId, userId, and eventType are required.' });
      return;
    }

    try {
      const result = await handlePaymentEvent({
        providerEventId: event.providerEventId,
        userId: event.userId,
        holdId: event.holdId,
        eventType: event.eventType,
        amountCents: event.amountCents ?? 0,
        payload: event.payload ?? {},
      });

      res.status(result.status === 'rejected' ? 400 : 200).json(result);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Payment processing failed',
      });
    }
  });

  return app;
}
