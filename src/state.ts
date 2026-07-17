import { createDb } from "./db.js";

export const db = createDb(process.env.DB_PATH ?? "./data/devdesk.db");
