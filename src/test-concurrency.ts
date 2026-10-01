import { execSync } from 'child_process';

const API_URL = 'http://localhost:4000';

async function runConcurrencyTest(numUsers: number) {
  console.log(`\n=================================================`);
  console.log(`STARTING CONCURRENCY TEST FOR ${numUsers} USERS`);
  console.log(`=================================================\n`);

  // 1. Reset Database data only (keep schema/tables, just wipe rows + restore stock)
  console.log('Resetting Database...');
  execSync(
    'docker exec sneakdrop-postgres psql -U sneakdrop -d sneakdrop -c ' +
    '"TRUNCATE holds, queue_entries, purchases, payment_events, users RESTART IDENTITY CASCADE; ' +
    'UPDATE inventory SET available_stock = 20; ' +
    'UPDATE sneaker_pairs SET stock_available = 20;"',
    { stdio: 'ignore' }
  );
  console.log('Database reset to exactly 20 pairs.\n');

  // 2. Fetch the sneaker pair ID
  const invRes = await fetch(`${API_URL}/inventory`);
  const invData = await invRes.json();
  const pairId = invData.pairs[0].id;
  const initialStock = invData.pairs[0].available_stock;

  // 3. Create N users in batches to avoid saturating the DB pool
  console.log(`Creating ${numUsers} users (in batches of 50)...`);
  const BATCH_SIZE = 50;
  const userIds: string[] = [];
  let userCreationErrors = 0;

  for (let batch = 0; batch < Math.ceil(numUsers / BATCH_SIZE); batch++) {
    const start = batch * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, numUsers);
    const batchPromises = Array.from({ length: end - start }).map(async (_, i) => {
      try {
        const res = await fetch(`${API_URL}/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `test${start + i}_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com` }),
        });
        const data = await res.json();
        if (data.user?.id) return data.user.id as string;
        userCreationErrors++;
        return null;
      } catch {
        userCreationErrors++;
        return null;
      }
    });
    const batchIds = await Promise.all(batchPromises);
    batchIds.forEach(id => { if (id) userIds.push(id); });
  }

  if (userCreationErrors > 0) {
    console.log(`  WARNING: ${userCreationErrors} user creation requests failed (pool saturation).`);
  }
  console.log(` ${userIds.length} users created.\n`);

  // 4. Hammer the API with Buy requests exactly at the same time
  console.log(`HAMMERING THE API: ${numUsers} concurrent Buy requests...`);
  
  const startTime = Date.now();
  
  const buyPromises = userIds.map((userId) =>
    fetch(`${API_URL}/holds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, pairId }),
    }).then(res => res.json()).catch(err => ({ error: err.message }))
  );

  const results = await Promise.all(buyPromises);
  const timeTaken = Date.now() - startTime;
  
  console.log(`All ${numUsers} requests completed in ${timeTaken}ms.\n`);

  // 5. Analyze Results
  let successfulHolds = 0;
  let queuedUsers = 0;
  const errorMap: Record<string, number> = {};

  results.forEach(res => {
    if (res.status === 'success') successfulHolds++;
    else if (res.status === 'queued') queuedUsers++;
    else {
      // Capture exact error message for diagnosis
      const key = res.error ?? res.message ?? JSON.stringify(res);
      errorMap[key] = (errorMap[key] ?? 0) + 1;
    }
  });

  const errors = Object.values(errorMap).reduce((a, b) => a + b, 0);

  // 6. Verify Database State
  const finalInvRes = await fetch(`${API_URL}/inventory`);
  const finalInvData = await finalInvRes.json();
  const finalStock = finalInvData.pairs[0].available_stock;

  console.log(` --- TEST REPORT (${numUsers} Users) --- `);
  console.log(`Total Requests Sent: ${numUsers}`);
  console.log(`Successful Holds (Got a pair): ${successfulHolds}`);
  console.log(`Waitlisted (Queued): ${queuedUsers}`);
  console.log(`Errors (Failed requests): ${errors}`);
  if (errors > 0) {
    console.log(`\nError Breakdown:`);
    Object.entries(errorMap).forEach(([msg, count]) => {
      console.log(`  [x${count}] ${msg}`);
    });
  }
  console.log(`Initial DB Stock: ${initialStock}`);
  console.log(`Final DB Stock: ${finalStock}`);
  console.log(`-------------------------------------------`);

  // 7. Success Criteria Check
  console.log(`\n RACE CONDITION CHECK:`);
  let passed = true;

  if (successfulHolds > initialStock) {
    console.log(` FAIL: Oversold! We issued ${successfulHolds} holds but only had ${initialStock} pairs.`);
    passed = false;
  } else {
    console.log(` PASS: Issued ${successfulHolds} holds without exceeding inventory limit of ${initialStock}.`);
  }

  if (finalStock < 0) {
    console.log(` FAIL: Inventory went negative (${finalStock}).`);
    passed = false;
  }

  if (initialStock - finalStock !== successfulHolds) {
    console.log(` FAIL: Inventory conservation violated! DB deducted ${initialStock - finalStock} but issued ${successfulHolds} holds.`);
    passed = false;
  } else {
    console.log(` PASS: Inventory conservation holds — issued ${successfulHolds} holds, stock dropped by exactly ${initialStock - finalStock}.`);
  }

  if (passed) {
    console.log(`\nPASS: No overselling detected under this concurrency test\n`);
  }
}

// Run for 20, 100, and 1000 users sequentially
async function runAll() {
  await runConcurrencyTest(20);
  await runConcurrencyTest(100);
  await runConcurrencyTest(1000);
}

runAll().catch(console.error);
