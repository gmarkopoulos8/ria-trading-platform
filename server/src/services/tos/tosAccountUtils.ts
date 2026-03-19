/**
 * Schwab / ThinkorSwim account detection and summary utilities.
 */

import type { TosAccount } from './tosInfoService';

export interface SchwabAccountSummary {
  accountNumber: string;
  accountNumberMasked: string;
  type: string;
  isPaper: boolean;
  label: string;
  equity: number;
  buyingPower: number;
  dayTradingBuyingPower: number;
  positionCount: number;
}

export function detectIsPaper(account: TosAccount): boolean {
  const acct = account.securitiesAccount;
  const typeStr = (acct.type ?? '').toUpperCase();
  const numStr = acct.accountNumber ?? '';
  return typeStr.includes('PAPER') || numStr.startsWith('999');
}

export function buildAccountSummary(account: TosAccount): SchwabAccountSummary {
  const acct = account.securitiesAccount;
  const balances = acct.currentBalances;
  const positions = acct.positions ?? [];
  const isPaper = detectIsPaper(account);
  const lastFour = acct.accountNumber.slice(-4);
  const typeLabel = isPaper ? 'paperMoney' : (acct.type ?? 'Brokerage');

  return {
    accountNumber: acct.accountNumber,
    accountNumberMasked: `...${lastFour}`,
    type: acct.type ?? 'BROKERAGE',
    isPaper,
    label: `${typeLabel} (..${lastFour})`,
    equity: balances?.equity ?? 0,
    buyingPower: balances?.buyingPower ?? 0,
    dayTradingBuyingPower: balances?.dayTradingBuyingPower ?? 0,
    positionCount: positions.filter(p => p.longQuantity > 0 || p.shortQuantity > 0).length,
  };
}
