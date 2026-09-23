import Database from "better-sqlite3";

import { DATA_DIR } from "@gatehouse/runtime";

let sqlite: Database.Database | null = null;

export function getDatabase() {
  if (sqlite) {
    return sqlite;
  }

  sqlite = new Database(`${DATA_DIR}/app.db`);

  return sqlite;
}

/**
 * Compatibility facade for the earlier resource packages.
 *
 * This deliberately remains lazy so importing @gatehouse/db does not open
 * SQLite before the GateHouse runtime/data directories have been initialised.
 */
export const db = new Proxy({} as Database.Database, {
  get(_target, property) {
    const database = getDatabase();
    const value = Reflect.get(database, property);

    return typeof value === "function" ? value.bind(database) : value;
  },
});
