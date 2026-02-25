import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Allow terminal sessions to reference non-parallax agents (e.g. team_agents).
  await sql`
    DO $$
    DECLARE fk_name text;
    BEGIN
      SELECT tc.constraint_name
      INTO fk_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'terminal_sessions'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'agent_id'
        AND ccu.table_name = 'parallax_agents'
      LIMIT 1;

      IF fk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE terminal_sessions DROP CONSTRAINT %I', fk_name);
      END IF;
    END $$;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Restore original FK behavior.
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name = 'terminal_sessions'
          AND constraint_name = 'terminal_sessions_agent_id_fkey'
      ) THEN
        ALTER TABLE terminal_sessions
          ADD CONSTRAINT terminal_sessions_agent_id_fkey
          FOREIGN KEY (agent_id) REFERENCES parallax_agents(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `.execute(db);
}
