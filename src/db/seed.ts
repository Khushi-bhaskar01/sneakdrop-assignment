import { dbPool } from './pool.js';

const pairNames = Array.from({ length: 20 }, (_, index) => `Sneaker Pair ${String(index + 1).padStart(2, '0')}`);

async function seedPairs() {
  await dbPool.query('BEGIN');

  try {
    for (const [index, name] of pairNames.entries()) {
      const sku = `DROP-${String(index + 1).padStart(2, '0')}`;
      await dbPool.query(
        `
          INSERT INTO sneaker_pairs (sku, name, colorway, stock_available)
          VALUES ($1, $2, $3, 1)
          ON CONFLICT (sku) DO NOTHING
        `,
        [sku, name, `Colorway ${index + 1}`],
      );
    }

    await dbPool.query(`
      INSERT INTO inventory (sneaker_pair_id, available_stock)
      SELECT sp.id, 1
      FROM sneaker_pairs sp
      LEFT JOIN inventory inv ON inv.sneaker_pair_id = sp.id
      WHERE inv.id IS NULL
      ON CONFLICT (sneaker_pair_id) DO UPDATE SET available_stock = EXCLUDED.available_stock
    `);

    await dbPool.query('COMMIT');
    console.log(`Seeded ${pairNames.length} sneaker pairs.`);
  } catch (error) {
    await dbPool.query('ROLLBACK');
    throw error;
  }
}

seedPairs()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  });
