import { dbPool, withTransaction } from '../db/pool.js';

export async function listPairs() {
  const result = await dbPool.query(
    `
      SELECT sp.id, sp.sku, sp.name, sp.colorway, inv.available_stock
      FROM sneaker_pairs sp
      INNER JOIN inventory inv ON inv.sneaker_pair_id = sp.id
      ORDER BY sp.id ASC
    `,
  );

  return result.rows;
}

export async function getPairById(pairId: number) {
  const result = await dbPool.query(
    `
      SELECT sp.id, sp.sku, sp.name, sp.colorway, inv.available_stock
      FROM sneaker_pairs sp
      INNER JOIN inventory inv ON inv.sneaker_pair_id = sp.id
      WHERE sp.id = $1
    `,
    [pairId],
  );

  return result.rows[0] ?? null;
}

export async function countUserPurchases(userId: string) {
  const result = await dbPool.query(
    'SELECT COUNT(*)::int AS total FROM purchases WHERE user_id = $1',
    [userId],
  );

  return Number(result.rows[0]?.total ?? 0);
}

export async function countUserActiveHolds(userId: string) {
  const result = await dbPool.query(
    "SELECT COUNT(*)::int AS total FROM holds WHERE user_id = $1 AND status = 'ACTIVE'",
    [userId],
  );

  return Number(result.rows[0]?.total ?? 0);
}

async function expireStaleHoldsForPair(client: any, pairId: number) {
  const expiredRows = await client.query(
    `
      SELECT id
      FROM holds
      WHERE sneaker_pair_id = $1 AND status = 'ACTIVE' AND expires_at <= NOW()
      FOR UPDATE
    `,
    [pairId],
  );

  for (const row of expiredRows.rows) {
    await client.query("UPDATE holds SET status = 'EXPIRED' WHERE id = $1", [row.id]);
  }

  if (expiredRows.rowCount > 0) {
    await client.query(
      'UPDATE inventory SET available_stock = available_stock + $1, updated_at = NOW() WHERE sneaker_pair_id = $2',
      [expiredRows.rowCount, pairId],
    );
  }

  return expiredRows.rowCount;
}

async function promoteNextQueuedUser(client: any, pairId: number) {
  const inventoryRow = await client.query(
    'SELECT available_stock FROM inventory WHERE sneaker_pair_id = $1 FOR UPDATE',
    [pairId],
  );

  if (inventoryRow.rowCount === 0) {
    return null;
  }

  if (Number(inventoryRow.rows[0].available_stock) <= 0) {
    return null;
  }

  const queuedRow = await client.query(
    `
      SELECT id, user_id
      FROM queue_entries
      WHERE sneaker_pair_id = $1 AND status = 'QUEUED'
      ORDER BY requested_at ASC, created_at ASC
      LIMIT 1
      FOR UPDATE
    `,
    [pairId],
  );

  if (queuedRow.rowCount === 0) {
    return null;
  }

  const nextUserId = queuedRow.rows[0].user_id;

  await client.query(
    "UPDATE queue_entries SET status = 'PROMOTED' WHERE id = $1",
    [queuedRow.rows[0].id],
  );

  const hold = await client.query(
    `
      INSERT INTO holds (user_id, sneaker_pair_id, status, expires_at)
      VALUES ($1, $2, 'ACTIVE', NOW() + INTERVAL '5 minutes')
      RETURNING id, user_id, sneaker_pair_id, status, expires_at, created_at
    `,
    [nextUserId, pairId],
  );

  await client.query(
    'UPDATE inventory SET available_stock = available_stock - 1, updated_at = NOW() WHERE sneaker_pair_id = $1',
    [pairId],
  );

  return { userId: nextUserId, hold: hold.rows[0] };
}

export async function reconcilePair(pairId: number) {
  return withTransaction(async (client) => {
    const inventoryRow = await client.query(
      'SELECT id, available_stock FROM inventory WHERE sneaker_pair_id = $1 FOR UPDATE',
      [pairId],
    );

    if (inventoryRow.rowCount === 0) {
      throw new Error('Sneaker pair not found.');
    }

    const expiredCount = await expireStaleHoldsForPair(client, pairId);
    const promoted = await promoteNextQueuedUser(client, pairId);

    return {
      expiredCount,
      promoted,
      availableStock: Number(inventoryRow.rows[0].available_stock) + expiredCount - Number(promoted ? 1 : 0),
    };
  });
}

export async function requestHoldForUser(userId: string, pairId: number) {
  return withTransaction(async (client) => {
    const inventoryResult = await client.query(
      'SELECT id, available_stock FROM inventory WHERE sneaker_pair_id = $1 FOR UPDATE',
      [pairId],
    );

    if (inventoryResult.rowCount === 0) {
      throw new Error('Sneaker pair not found.');
    }

    await expireStaleHoldsForPair(client, pairId);

    const inventory = inventoryResult.rows[0];

    if (inventory.available_stock <= 0) {
      const existingQueue = await client.query(
        `
          SELECT id, status, requested_at
          FROM queue_entries
          WHERE user_id = $1 AND sneaker_pair_id = $2 AND status = 'QUEUED'
        `,
        [userId, pairId],
      );

      if ((existingQueue.rowCount ?? 0) > 0) {
        return {
          status: 'queued',
          queueEntry: existingQueue.rows[0],
        };
      }

      const queueEntry = await client.query(
        `
          INSERT INTO queue_entries (user_id, sneaker_pair_id, status, requested_at)
          VALUES ($1, $2, 'QUEUED', NOW())
          RETURNING id, user_id, sneaker_pair_id, status, requested_at, created_at
        `,
        [userId, pairId],
      );

      return {
        status: 'queued',
        queueEntry: queueEntry.rows[0],
      };
    }

    const activeHoldCount = await client.query(
      "SELECT COUNT(*)::int AS total FROM holds WHERE user_id = $1 AND status = 'ACTIVE'",
      [userId],
    );

    if (Number(activeHoldCount.rows[0]?.total ?? 0) >= 1) {
      throw new Error('User already has an active hold.');
    }

    const purchasesCount = await client.query(
      'SELECT COUNT(*)::int AS total FROM purchases WHERE user_id = $1',
      [userId],
    );

    if (Number(purchasesCount.rows[0]?.total ?? 0) >= 2) {
      throw new Error('User has already reached the maximum of 2 purchases.');
    }

    const hold = await client.query(
      `
        INSERT INTO holds (user_id, sneaker_pair_id, status, expires_at)
        VALUES ($1, $2, 'ACTIVE', NOW() + INTERVAL '5 minutes')
        RETURNING id, user_id, sneaker_pair_id, status, expires_at, created_at
      `,
      [userId, pairId],
    );

    await client.query(
      'UPDATE inventory SET available_stock = available_stock - 1, updated_at = NOW() WHERE sneaker_pair_id = $1',
      [pairId],
    );

    return {
      status: 'success',
      hold: hold.rows[0],
    };
  });
}

export async function createActiveHold(userId: string, pairId: number) {
  return requestHoldForUser(userId, pairId);
}
