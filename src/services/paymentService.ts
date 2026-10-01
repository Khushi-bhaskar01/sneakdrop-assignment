import { withTransaction } from '../db/pool.js';

export type PaymentEventInput = {
  providerEventId: string;
  userId: string;
  holdId?: string;
  eventType: 'payment.succeeded' | 'payment.failed';
  amountCents?: number;
  payload?: Record<string, unknown>;
};

export async function handlePaymentEvent(input: PaymentEventInput) {
  return withTransaction(async (client) => {
    const duplicateCheck = await client.query(
      'SELECT id, status, event_type FROM payment_events WHERE provider_event_id = $1 FOR UPDATE',
      [input.providerEventId],
    );

    if (duplicateCheck.rowCount && duplicateCheck.rowCount > 0) {
      const current = duplicateCheck.rows[0];
      return {
        status: current.status === 'PROCESSED' ? 'duplicate' : 'already_recorded',
        eventType: current.event_type,
        providerEventId: input.providerEventId,
      };
    }

    if (!input.holdId) {
      await client.query(
        `
          INSERT INTO payment_events (provider_event_id, user_id, event_type, payload, status)
          VALUES ($1, $2, $3, $4::jsonb, 'REJECTED')
        `,
        [input.providerEventId, input.userId, input.eventType, JSON.stringify(input.payload ?? {})],
      );

      return {
        status: 'rejected',
        reason: 'Missing holdId',
        providerEventId: input.providerEventId,
      };
    }

    if (input.eventType === 'payment.failed') {
      await client.query(
        `
          INSERT INTO payment_events (provider_event_id, user_id, hold_id, event_type, payload, status)
          VALUES ($1, $2, $3, $4, $5::jsonb, 'PROCESSED')
        `,
        [input.providerEventId, input.userId, input.holdId, input.eventType, JSON.stringify(input.payload ?? {})],
      );

      return {
        status: 'recorded',
        providerEventId: input.providerEventId,
        effect: 'hold_not_released',
      };
    }

    const holdResult = await client.query(
      `
        SELECT id, user_id, sneaker_pair_id, status, expires_at
        FROM holds
        WHERE id = $1
        FOR UPDATE
      `,
      [input.holdId],
    );

    if (holdResult.rowCount === 0) {
      await client.query(
        `
          INSERT INTO payment_events (provider_event_id, user_id, hold_id, event_type, payload, status)
          VALUES ($1, $2, $3, $4, $5::jsonb, 'REJECTED')
        `,
        [input.providerEventId, input.userId, input.holdId, input.eventType, JSON.stringify(input.payload ?? {})],
      );

      return {
        status: 'rejected',
        reason: 'Hold not found',
        providerEventId: input.providerEventId,
      };
    }

    const hold = holdResult.rows[0];

    if (hold.user_id !== input.userId) {
      await client.query(
        `
          INSERT INTO payment_events (provider_event_id, user_id, hold_id, event_type, payload, status)
          VALUES ($1, $2, $3, $4, $5::jsonb, 'REJECTED')
        `,
        [input.providerEventId, input.userId, input.holdId, input.eventType, JSON.stringify(input.payload ?? {})],
      );

      return {
        status: 'rejected',
        reason: 'Hold belongs to a different user',
        providerEventId: input.providerEventId,
      };
    }

    if (hold.status !== 'ACTIVE') {
      await client.query(
        `
          INSERT INTO payment_events (provider_event_id, user_id, hold_id, event_type, payload, status)
          VALUES ($1, $2, $3, $4, $5::jsonb, 'REJECTED')
        `,
        [input.providerEventId, input.userId, input.holdId, input.eventType, JSON.stringify(input.payload ?? {})],
      );

      return {
        status: 'rejected',
        reason: 'Hold is not active',
        providerEventId: input.providerEventId,
      };
    }

    if (new Date(hold.expires_at).getTime() <= Date.now()) {
      await client.query(
        `
          INSERT INTO payment_events (provider_event_id, user_id, hold_id, event_type, payload, status)
          VALUES ($1, $2, $3, $4, $5::jsonb, 'REJECTED')
        `,
        [input.providerEventId, input.userId, input.holdId, input.eventType, JSON.stringify(input.payload ?? {})],
      );

      return {
        status: 'rejected',
        reason: 'Hold expired before payment succeeded',
        providerEventId: input.providerEventId,
      };
    }

    const purchaseCheck = await client.query(
      'SELECT id FROM purchases WHERE hold_id = $1 OR payment_event_id = $2',
      [input.holdId, input.providerEventId],
    );

    if (purchaseCheck.rowCount && purchaseCheck.rowCount > 0) {
      await client.query(
        `
          INSERT INTO payment_events (provider_event_id, user_id, hold_id, event_type, payload, status)
          VALUES ($1, $2, $3, $4, $5::jsonb, 'DUPLICATE')
          ON CONFLICT (provider_event_id) DO NOTHING
        `,
        [input.providerEventId, input.userId, input.holdId, input.eventType, JSON.stringify(input.payload ?? {})],
      );

      return {
        status: 'duplicate',
        providerEventId: input.providerEventId,
        holdId: input.holdId,
      };
    }

    const purchase = await client.query(
      `
        INSERT INTO purchases (user_id, hold_id, sneaker_pair_id, payment_event_id, amount_cents)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, user_id, hold_id, sneaker_pair_id, payment_event_id, amount_cents, created_at
      `,
      [input.userId, input.holdId, hold.sneaker_pair_id, input.providerEventId, input.amountCents ?? 0],
    );

    await client.query(
      "UPDATE holds SET status = 'PURCHASED' WHERE id = $1",
      [input.holdId],
    );

    await client.query(
      `
        INSERT INTO payment_events (provider_event_id, user_id, hold_id, event_type, payload, status)
        VALUES ($1, $2, $3, $4, $5::jsonb, 'PROCESSED')
        ON CONFLICT (provider_event_id) DO NOTHING
      `,
      [input.providerEventId, input.userId, input.holdId, input.eventType, JSON.stringify(input.payload ?? {})],
    );

    return {
      status: 'processed',
      purchase: purchase.rows[0],
      providerEventId: input.providerEventId,
    };
  });
}
