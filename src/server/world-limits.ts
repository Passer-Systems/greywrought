import { isIP } from 'node:net';

function canonicalAddress(value: string): string | null {
  if (value.includes('%')) return null;
  const family = isIP(value);
  if (!family) return null;
  if (family === 4) return value;
  const address = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([\da-f]+):([\da-f]+)$/.exec(address);
  if (!mapped) return address;
  const high = parseInt(mapped[1]!, 16), low = parseInt(mapped[2]!, 16);
  return `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`;
}

export function clientAddress(peer: string, forwarded: string | null, trustProxy: boolean): string | null {
  const address = canonicalAddress(peer);
  if (address && trustProxy && (address === '::1' || address.startsWith('127.'))) {
    // Only the explicitly configured local proxy may provide this single IP.
    return forwarded === null ? null : canonicalAddress(forwarded);
  }
  return address;
}

interface Window { start: number; count: number; }
interface AddressBudget { attempts: Window; registrations: Window; connections: number; touched: number; }
const IDLE_MS = 10 * 60_000;
const MAX_ADDRESSES = 4096;

export function createAddressLimits() {
  const addresses = new Map<string, AddressBudget>();
  let lastPruned = 0;
  function prune(now: number): void {
    if (now - lastPruned < 30_000) return;
    lastPruned = now;
    for (const [address, budget] of addresses) if (!budget.connections && now - budget.touched >= IDLE_MS) addresses.delete(address);
  }
  function take(window: Window, now: number, duration: number, maximum: number): boolean {
    if (now - window.start >= duration) { window.start = now; window.count = 0; }
    if (window.count >= maximum) return false;
    window.count++;
    return true;
  }
  return {
    attempt(address: string, now: number): 'allowed' | 'limited' | 'full' {
      prune(now);
      let budget = addresses.get(address);
      if (!budget) {
        if (addresses.size >= MAX_ADDRESSES) return 'full';
        budget = { attempts: { start: now, count: 0 }, registrations: { start: now, count: 0 }, connections: 0, touched: now };
        addresses.set(address, budget);
      }
      budget.touched = now;
      return take(budget.attempts, now, 60_000, 60) ? 'allowed' : 'limited';
    },
    connect(address: string): boolean {
      const budget = addresses.get(address)!;
      if (budget.connections >= 32) return false;
      budget.connections++;
      return true;
    },
    disconnect(address: string): void { const budget = addresses.get(address); if (budget) budget.connections--; },
    register(address: string, now: number): boolean {
      const budget = addresses.get(address)!;
      budget.touched = now;
      return take(budget.registrations, now, IDLE_MS, 40);
    },
    prune,
  };
}
