import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Base de données SQLite (un seul fichier), intégrée à Node.js : rien à installer.
 * Emplacement : dossier DATA_DIR (par défaut ./data). Sur Hostinger, choisir un dossier
 * qui n'est pas effacé quand on redéploie le site.
 */
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  kind TEXT NOT NULL,            -- pdf | doc | scan | texte
  file TEXT,                     -- nom du fichier d'origine dans DATA_DIR/fichiers
  size INTEGER NOT NULL DEFAULT 0,
  pages INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,          -- wait | ok | err
  error TEXT,
  text TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY,
  visitor TEXT NOT NULL,
  ts INTEGER NOT NULL,
  mobile INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS visits_ts ON visits(ts);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY,
  visitor TEXT NOT NULL,
  ts INTEGER NOT NULL,
  lang TEXT NOT NULL,            -- fr | ar
  mobile INTEGER NOT NULL,
  topic TEXT NOT NULL,
  answered INTEGER NOT NULL,
  handled INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS questions_ts ON questions(ts);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

const g = globalThis as unknown as { __ucabDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (!g.__ucabDb) {
    mkdirSync(DATA_DIR, { recursive: true });
    const d = new DatabaseSync(path.join(DATA_DIR, "ucab.db"));
    d.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;");
    d.exec(SCHEMA);
    g.__ucabDb = d;
  }
  return g.__ucabDb;
}

export type Row = Record<string, string | number | null>;

export function all<T = Row>(sql: string, ...params: (string | number | null)[]): T[] {
  return db().prepare(sql).all(...params) as T[];
}

export function get<T = Row>(sql: string, ...params: (string | number | null)[]): T | undefined {
  return db().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: (string | number | null)[]) {
  return db().prepare(sql).run(...params);
}
