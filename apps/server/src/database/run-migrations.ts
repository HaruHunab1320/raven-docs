/**
 * Production migration runner
 *
 * This script runs migrations without depending on kysely-migration-cli
 * (which is a dev dependency). It uses Kysely's built-in Migrator API directly.
 *
 * Usage: node dist/database/run-migrations.js
 */
import * as path from 'path';
import { promises as fs } from 'fs';
import { Pool } from 'pg';
import {
  Kysely,
  Migrator,
  PostgresDialect,
  FileMigrationProvider,
} from 'kysely';

async function runMigrations() {
  console.log('Starting database migrations...');

  // Support both DATABASE_URL and individual env vars
  const connectionString = process.env.DATABASE_URL;
  const dbHost = process.env.DB_HOST;
  const dbPort = process.env.DB_PORT || '5432';
  const dbName = process.env.DB_NAME;
  const dbUser = process.env.DB_USER;
  const dbPassword = process.env.DB_PASSWORD;

  const migrationFolder = path.join(__dirname, './migrations');
  console.log(`Migration folder: ${migrationFolder}`);

  let poolConfig: any;

  if (connectionString) {
    console.log('Using DATABASE_URL for connection');
    poolConfig = { connectionString };
  } else if (dbHost && dbName && dbUser && dbPassword) {
    console.log(`Using individual env vars for connection (host: ${dbHost})`);
    poolConfig = {
      host: dbHost,
      port: parseInt(dbPort, 10),
      database: dbName,
      user: dbUser,
      password: dbPassword,
    };
  } else {
    console.error('ERROR: Either DATABASE_URL or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD must be set');
    process.exit(1);
  }

  const db = new Kysely<any>({
    dialect: new PostgresDialect({
      pool: new Pool(poolConfig),
    }),
  });

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder,
    }),
  });

  try {
    const { error, results } = await migrator.migrateToLatest();

    results?.forEach((result) => {
      if (result.status === 'Success') {
        console.log(`Migration "${result.migrationName}" was executed successfully`);
      } else if (result.status === 'Error') {
        console.error(`Failed to execute migration "${result.migrationName}"`);
      } else if (result.status === 'NotExecuted') {
        console.log(`Migration "${result.migrationName}" was not executed (already applied)`);
      }
    });

    if (error) {
      console.error('Migration failed:', error);
      await db.destroy();
      process.exit(1);
    }

    if (!results || results.length === 0) {
      console.log('No migrations to run - database is up to date');
    } else {
      const successful = results.filter(r => r.status === 'Success').length;
      console.log(`Successfully ran ${successful} migration(s)`);
    }

    await db.destroy();
    console.log('Migrations completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    await db.destroy();
    process.exit(1);
  }
}

runMigrations();
