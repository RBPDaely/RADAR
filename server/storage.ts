import * as fs from 'fs';
import * as path from 'path';
import { RadarCredentials } from './types';

const CREDENTIALS_FILE = path.resolve(process.cwd(), '.radar_credentials.json');

export function loadCredentials(): RadarCredentials | null {
  try {
    if (!fs.existsSync(CREDENTIALS_FILE)) return null;
    const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.funderAddress || parsed.signerPrivateKey)) {
      return parsed as RadarCredentials;
    }
  } catch (e) {
    console.error('[Storage] Error loading credentials:', e);
  }
  return null;
}

export function saveCredentials(creds: RadarCredentials): boolean {
  try {
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
    return true;
  } catch (e) {
    console.error('[Storage] Error saving credentials:', e);
    return false;
  }
}

export function purgeCredentials(): boolean {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      fs.unlinkSync(CREDENTIALS_FILE);
    }
    return true;
  } catch (e) {
    console.error('[Storage] Error purging credentials:', e);
    return false;
  }
}
