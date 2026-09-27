import { getDatabase } from '@gatehouse/db';

type GateHouseDatabase = ReturnType<typeof getDatabase>;

export const sqlite = new Proxy({} as GateHouseDatabase, {
  get(_target, property) {
    const database = getDatabase();
    const value = Reflect.get(database, property);

    return typeof value === 'function' ? value.bind(database) : value;
  }
});
