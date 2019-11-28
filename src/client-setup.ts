import Arweave from "arweave/node";

// @ts-ignore
import ipfsClient from 'ipfs-http-client';

////////////////////////////////////
// Read Environment & setup client.

if (typeof process.env.AR_WALLET_JSON !== 'string') {
  throw new Error('Please set AR_WALLET_JSON environment variable');
}

export const arweaveKey = JSON.parse(process.env.AR_WALLET_JSON as string);

const IPFS_HOST = process.env.IPFS_API_HOST || 'ipfs.infura.io';
const IPFS_PORT = parseInt(process.env.IPFS_API_PORT || '') || 5001;
const IPFS_PROTO = process.env.IPFS_API_PROTOCOL || 'https';

export const ipfs = ipfsClient({ host: IPFS_HOST, port: IPFS_PORT, protocol: IPFS_PROTO });

export const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https'
})
