import { dbPool } from '../db/pool.js';

export async function createUser(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error('Email is required.');
  }

  const result = await dbPool.query(
    `
      INSERT INTO users (email)
      VALUES ($1)
      ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
      RETURNING id, email, created_at
    `,
    [normalizedEmail],
  );

  return result.rows[0];
}

export async function getUserById(userId: string) {
  const result = await dbPool.query(
    'SELECT id, email, created_at FROM users WHERE id = $1',
    [userId],
  );

  return result.rows[0] ?? null;
}
