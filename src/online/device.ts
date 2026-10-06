/**
 * The account key kept on this device. A player who picks a name gets a Supabase
 * account with a long random password; the password lives only here (and the
 * recovery code restores the account anywhere else).
 */
export interface DeviceLogin {
  name: string;
  email?: string;
  password?: string;
  /** recovery code, kept so the player can look it up again in the account panel */
  code?: string;
  /** picked offline: the account is created the next time we're online */
  pending?: boolean;
}

export const DEVICE_KEY = 'ore-to-empire/device-login';

export function loadDevice(): DeviceLogin | null {
  try {
    const d = JSON.parse(localStorage.getItem(DEVICE_KEY) ?? 'null');
    return d && typeof d.name === 'string' ? (d as DeviceLogin) : null;
  } catch {
    return null;
  }
}

export function saveDevice(d: DeviceLogin) {
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(d));
  } catch {
    /* storage blocked: the player will need the recovery code next time */
  }
}

export function clearDevice() {
  try {
    localStorage.removeItem(DEVICE_KEY);
  } catch {
    /* ignore */
  }
}
