import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.diamant');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const DEFAULT_DB_PATH = path.join(CONFIG_DIR, 'default.db');

export interface CliConfig {
  dbPath: string;
  activeBaseId?: string;
}

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): CliConfig {
  ensureConfigDir();
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return { dbPath: DEFAULT_DB_PATH, ...JSON.parse(content) };
    } catch {
      return { dbPath: DEFAULT_DB_PATH };
    }
  }
  return { dbPath: DEFAULT_DB_PATH };
}

export function saveConfig(config: CliConfig): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function getDbPath(override?: string): string {
  if (override) return override;
  const config = loadConfig();
  return config.dbPath;
}

export function getActiveBaseId(): string | undefined {
  const config = loadConfig();
  return config.activeBaseId;
}

export function setActiveBaseId(baseId: string): void {
  const config = loadConfig();
  config.activeBaseId = baseId;
  saveConfig(config);
}
