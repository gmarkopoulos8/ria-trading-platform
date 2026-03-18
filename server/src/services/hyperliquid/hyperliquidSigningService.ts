/**
 * Hyperliquid EIP-712 signing — TypeScript implementation.
 * Replicates the logic from the official hyperliquid-python-sdk:
 *   signing.py / sign_l1_action + action_hash
 *
 * Algorithm:
 *  1. Msgpack-encode the action
 *  2. Append nonce (8 bytes big-endian) + vault flag
 *  3. keccak256 → connectionId
 *  4. EIP-712 sign Agent { source, connectionId } with domain "Exchange"
 */

import { ethers } from 'ethers';
import { encode } from '@msgpack/msgpack';
import { HL_CONFIG } from './hyperliquidConfig';

const EXCHANGE_DOMAIN = {
  chainId: 1337,
  name: 'Exchange',
  verifyingContract: '0x0000000000000000000000000000000000000000',
  version: '1',
} as const;

const AGENT_TYPES: Record<string, ethers.TypedDataField[]> = {
  Agent: [
    { name: 'source',       type: 'string'  },
    { name: 'connectionId', type: 'bytes32' },
  ],
};

function buildConnectionId(actionBytes: Uint8Array, vaultAddress: string | null, nonce: number): string {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64BE(BigInt(nonce));

  let extra: Buffer;
  if (!vaultAddress) {
    extra = Buffer.concat([nonceBuf, Buffer.from([0x00])]);
  } else {
    const addrHex = vaultAddress.startsWith('0x') ? vaultAddress.slice(2) : vaultAddress;
    extra = Buffer.concat([nonceBuf, Buffer.from([0x01]), Buffer.from(addrHex, 'hex')]);
  }

  const combined = Buffer.concat([Buffer.from(actionBytes), extra]);
  return ethers.keccak256(combined);
}

export interface HLSignature {
  r: string;
  s: string;
  v: number;
}

export async function signL1Action(
  action: object,
  vaultAddress: string | null,
  nonce: number,
): Promise<HLSignature> {
  const privateKey = HL_CONFIG.AGENT_PRIVATE_KEY ?? HL_CONFIG.PRIVATE_KEY;
  if (!privateKey) throw new Error('No signing key configured. Set HL_PRIVATE_KEY or HL_AGENT_PRIVATE_KEY.');

  const actionBytes = encode(action);
  const connectionId = buildConnectionId(actionBytes, vaultAddress, nonce);

  const wallet = new ethers.Wallet(privateKey);
  const sigHex = await wallet.signTypedData(
    EXCHANGE_DOMAIN,
    AGENT_TYPES,
    { source: HL_CONFIG.IS_MAINNET ? 'a' : 'b', connectionId },
  );

  const sig = ethers.Signature.from(sigHex);
  return { r: sig.r, s: sig.s, v: sig.v };
}

export function nowNonce(): number {
  return Date.now();
}

export function signerAddress(): string | null {
  const key = HL_CONFIG.AGENT_PRIVATE_KEY ?? HL_CONFIG.PRIVATE_KEY;
  if (!key) return null;
  try {
    return new ethers.Wallet(key).address;
  } catch {
    return null;
  }
}
