import { dbPool } from './pool.js';

async function seedPairs() {
  await dbPool.query('BEGIN');

  try {
    const sku = 'DROP-01';
    await dbPool.query(
      `
        INSERT INTO sneaker_pairs (sku, name, colorway, stock_available)
        VALUES ($1, $2, $3, 20)
        ON CONFLICT (sku) DO NOTHING
      `,
      [sku, 'Exclusive Limited Sneaker', 'Black/Gold'],
    );

    await dbPool.query(`
      INSERT INTO inventory (sneaker_pair_id, available_stock)
      SELECT sp.id, 20
      FROM sneaker_pairs sp
      LEFT JOIN inventory inv ON inv.sneaker_pair_id = sp.id
      WHERE inv.id IS NULL
      ON CONFLICT (sneaker_pair_id) DO UPDATE SET available_stock = EXCLUDED.available_stock
    `);

    await dbPool.query('COMMIT');
    console.log(`Seeded 1 sneaker pair with 20 stock.`);
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
