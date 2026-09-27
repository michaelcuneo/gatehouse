import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { DATA_DIR } from "@gatehouse/runtime";

let sqlite: Database.Database | null = null;
let sqlitePath: string | null = null;

function currentDatabasePath() {
  const configuredRoot = process.env.GATEHOUSE_ROOT?.trim();
  const dataDirectory = configuredRoot
    ? path.join(path.resolve(configuredRoot), "data")
    : DATA_DIR;

  return path.join(dataDirectory, "app.db");
}

export function getDatabase() {
  const nextPath = currentDatabasePath();

  if (sqlite && sqlitePath === nextPath) {
    return sqlite;
  }

  if (sqlite) {
    sqlite.close();
    sqlite = null;
    sqlitePath = null;
  }

  fs.mkdirSync(path.dirname(nextPath), {
    recursive: true,
  });

  sqlite = new Database(nextPath);
  sqlitePath = nextPath;

  return sqlite;
}

export function closeDatabase() {
  if (!sqlite) {
    return;
  }

  sqlite.close();
  sqlite = null;
  sqlitePath = null;
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
