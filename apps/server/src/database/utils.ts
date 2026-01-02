import { Kysely, Transaction } from 'kysely';
import { DB } from './types/db';

/*
 * Executes a transaction or a callback using the provided database instance.
 * If an existing transaction is provided, it directly executes the callback with it.
 * Otherwise, it starts a new transaction using the provided database instance and executes the callback within that transaction.
 */
export async function executeTx<T>(
  db: Kysely<DB>,
  callback: (trx: Transaction<DB>) => Promise<T>,
  existingTrx?: Transaction<DB>,
): Promise<T> {
  if (existingTrx) {
    return await callback(existingTrx); // Execute callback with existing transaction
  } else {
    return await db.transaction().execute((trx) => callback(trx)); // Start new transaction and execute callback
  }
}

/*
 * This function returns either an existing transaction if provided,
 * or the normal database instance.
 */
export function dbOrTx(
  db: Kysely<DB>,
  existingTrx?: Transaction<DB>,
): Kysely<DB> | Transaction<DB> {
  if (existingTrx) {
    return existingTrx; // Use existing transaction
  } else {
    return db; // Use normal database instance
  }
}
