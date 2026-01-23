import { Kysely, sql } from 'kysely';

/**
 * Adds missing billing/subscription columns to workspaces table.
 * These columns were defined in the types but migration was missing.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('workspaces')
    .addColumn('status', 'varchar', (col) => col)
    .addColumn('plan', 'varchar', (col) => col)
    .addColumn('enforce_sso', 'boolean', (col) => col.defaultTo(false).notNull())
    .addColumn('license_key', 'varchar', (col) => col)
    .addColumn('stripe_customer_id', 'varchar', (col) => col)
    .addColumn('trial_end_at', 'timestamptz', (col) => col)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('workspaces')
    .dropColumn('status')
    .dropColumn('plan')
    .dropColumn('enforce_sso')
    .dropColumn('license_key')
    .dropColumn('stripe_customer_id')
    .dropColumn('trial_end_at')
    .execute();
}
