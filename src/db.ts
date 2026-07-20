import pg from "pg";
import { config } from "./config.js";

// wakatime-cli sends epoch seconds as numbers; make sure pg returns
// DOUBLE PRECISION and BIGINT as JS numbers rather than strings.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => parseInt(v, 10));
pg.types.setTypeParser(pg.types.builtins.FLOAT8, (v) => parseFloat(v));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as never);
}
