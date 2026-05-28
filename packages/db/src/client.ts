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
