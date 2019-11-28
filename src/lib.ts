// @ts-ignore
import CID from 'cids';

// @ts-ignore
import detectFileType from 'detect-file-type';

import { promisify } from "util";
import { batch } from "promises-tho";
import { ipfs, arweave, arweaveKey } from './client-setup';
import * as crypto from 'crypto';

/**
 * Maximum file size in bytes
 */
export const MAX_FILE_SIZE = 1024 * 1024 * 10;

/**
 *  Maximum file size in human readable text. 
 */
export const MAX_FILE_SIZE_TEXT = '10MiB';

/**
 * Type to specify the files mime type, if available.
 */
export type FileType = { mime: string } | null;

/**
 * Indicates a file has been permafied to Arweave and Pinned to IPFS 
 */
export interface PermafiySuccessResult {
  /**
   * Boolean to indicate success
   */
  ok: true 

  /**
   * The IPFS Cid
   */
  hash: string 
  
  /**
   * The arweave transaction id
   */
  id: string

  /**
   * If we found the file already on arweave, this will be set to true. 
   */
  alreadyPinned?: true
}

/**
 * Indicates there was an error attemping to permafiy the file. 
 */
export interface PermafiyErrorResult {
  
  /**
   * Boolean to indicate failure 
   */
  ok: false 

  /**
   * A human readable error message.
   */
  error: string 
}

/**
 * Permaify a new file to both Arweave and IPFS. 
 * 
 * File must not be over the maximum size, (currently 10MiB)
 * 
 * @param {Buffer} data byte array of the files data
 * @param {string} contentType optional content-type to add to arweave.
 */

export async function permafiyFile(data: Buffer | Uint8Array, contentType?: string): Promise<PermafiySuccessResult | PermafiyErrorResult> {
  
  const ipfsResult = await putIpfsFile(data);
  const cid = ipfsResult[0].hash; 
  
  if (!parseCid(cid)) {
    throw new Error(`Unexpected response putting file to ipfs: ${cid}`);
  }

  
  const res = await putArweaveFile(cid, data, contentType);
  return res as any; //todo: fix
}


/**
 * Permaifys an existing IPFS file given its CID. 
 * 
 * Must be a file type.
 * Must be 10MiB or less.
 * 
 * @param {string} cid A valid IPFS CID.
 * @returns {object} an object with ids: { hash, id, ok: true }, or an object with an error: { error: 'reason', ok: false }
 */
export async function permafiyExisting(cid: string): Promise<PermafiySuccessResult | PermafiyErrorResult> {

  const ipfsGet = await getIpfsFileSimple(cid);
  
  if (!ipfsGet) {
    return { ok: false, error: `Unable to find ${cid} on IPFS Network`}
  }
  if (ipfsGet.data.byteLength > MAX_FILE_SIZE) {
    return { ok: false, error: `File is too large, maximum size is: ${MAX_FILE_SIZE_TEXT}` }
  }

  // Check if its aleady on Arweave.
  const existing = await findIpfsFileOnArweave(cid);
  if (existing) {
    return { ok: true, hash: cid, id: existing, alreadyPinned: true };
  }

  return putArweaveFile(cid, ipfsGet.data, ipfsGet.fileType ? ipfsGet.fileType.mime : undefined);
}

/**
 * Permaify many existing CIDs. 
 * 
 * @param cids {string} an aray of valid base58 encoded CIDs. 
 */
export async function permaifyManyExisting(cids: string[]): Promise<(PermafiySuccessResult | PermafiyErrorResult)[]> {

  // Verify all the CIDs are valid.
  cids.forEach(cid => {
    if (!parseCid(cid)) {
      throw new Error(`Invalid CID: ${cid}`);
    }
  })

  // Soft fail with ok: false and last exception. 
  const op = async (cid: string): Promise<PermafiySuccessResult | PermafiyErrorResult> => {
    try {
      return await permafiyExisting(cid); 
    } catch (e) {
      console.error(e);
      return { ok: false, error: e.message };
    }
  }

  // Batch in sizes of 10s
  const batcher = batch({ batchSize: 10, batchDelayMs: 30 }, op);
  return batcher(cids);

}


/**
 * Attempts to detect a mime type from a Buffer or Uint8Array. 
 * Promise returning function.
 * 
 * @param data Buffer containing bytes
 * @returns a promise of object like { mime: 'image/png' } or null 
 * 
 */
export const detectFileTypeFromBuffer: (data: Buffer | Uint8Array) => Promise<FileType> 
  = promisify(detectFileType.fromBuffer.bind(detectFileType));


/**
 * Tries to parse a CID to an object form. 
 * 
 * Never throws an exception. 
 * Returns a parsed object or falsey if the CID is invalid. 
 * 
 * @param {string} cid A Valid IPFS CID
 */
export function parseCid(cid: string): false | object {
  try {
    return new CID(cid);
  } catch (e) {
    return false;
  }
}

/**
 * Gets a file from IPFS and detects its content type.
 * 
 * @param {string} path valid path to an IPFS file.
 * @returns {object} { data: Buffer, file: { mime: 'text/html' } } or undefined if the CID could not be found
 */
export async function getIpfsFileSimple(path: string): Promise<{ data: Buffer, fileType: FileType } | undefined> {
  try { 
    const data = await ipfs.cat(path, { timeout: 1000*50 });
    const fileType = await detectFileTypeFromBuffer(data);
    return {
      data,
      fileType
    }
  } catch (e) {
    console.warn(e);
    return undefined;
  }
}

/**
 * Searches for a file already on Arweave by CID. 
 * Verifies the data really is a match. 
 * The file must have been saved with the same format CID 
 * 
 * May result in a false-negative result in some edge cases,
 * This is ok because you can upload the data/add again 
 * to arweave with no ill effects except some duplication
 * and storage costs. These cases should be rare.
 * 
 * @param {string} cid A valid IPFS CID.
 * @returns {string | undefined} txid or undefined.
 */
export async function findIpfsFileOnArweave(cid: string) {
  
  const txs = await arweave.arql({ op: 'equals', expr1: 'IPFS-Add', expr2: cid });
  
  if (!txs.length) {
    return; 
  }

  // This promise will be resolved just once.
  const ipfsProm = getIpfsFileSimple(cid); 
  
  let maxChecks = 5; 
  let i = txs.length;

  // Check oldest txs first .. 
  console.log(`Checking a maximum of ${maxChecks} from ${txs.length}`)
  while (--i >= 0 && maxChecks-- > 0) {
    const [ arData, ipfsData] = await Promise.all([
      arweave.api.get(`${txs[i]}.data`, { responseType: 'arraybuffer'}).then(x => x.data),
      ipfsProm
    ])
    if (!ipfsData) {
      // Couldn't get the data from IPFS. Returning undefined/not found is not ideal, 
      // but its fail-safe since it instructs the caller to upload or pin the data in 
      // Arweave again. Its possible for this to happen in a race situation, or network
      // issue with IPFS.  
      return undefined;
    }
    const hash1 = crypto.createHash('sha256').update(arData).digest('base64')
    const hash2 = crypto.createHash('sha256').update(ipfsData.data).digest('base64')
    if (hash1 === hash2) {
      console.log(`Found file alerady on Arweave with matching data, ${txs[i]}`)
      return txs[i];
    } else {
      console.warn(`Ar data`, arData);
      console.warn('IPFS data', ipfsData);
      console.warn(`Data mismatch, IPFS and Arweave data for the same hash dont match, ${txs[i]} - ${cid}`);
    }
  }
  console.log(`Unable to find already on Arweave`);
  return undefined;
}

// Typed return type for ipfs-http-client / ipfs api.
export type IpfsPutFileResult = { path: string, hash: string, size: number }[];

/**
 * Adds a file to ipfs. 
 * 
 * @param file 
 */
export async function putIpfsFile(file: Buffer | Uint8Array | File): Promise<IpfsPutFileResult> {
  const result = await ipfs.add(file);
  return result;
}

/**
 * Add a file to arweave. Should be already be added to IPFS.
 * If filetype is supplied the `mime` property will be used as
 * a content-type tag. 
 * 
 * @param {string} cid A valid IPFS CID  
 * @param {Buffer | Uint8Array} data buffer of data. 
 * @param {string=} contentType optional content-type .
 * 
 * @returns an object in the format { hash, id, ok: true }
 */
export async function putArweaveFile(cid: string, data: Buffer | Uint8Array, contentType?: string): Promise<PermafiySuccessResult> {
  
  const tx = await arweave.createTransaction({
    data
  }, arweaveKey);

  if (contentType) {
    tx.addTag('Content-Type', contentType);
  }

  tx.addTag('IPFS-Add', cid);

  await arweave.transactions.sign(tx, arweaveKey);
  const resp = await arweave.transactions.post(tx);
  
  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`Error posting file to Arweave: ${resp.status} - ${resp.statusText}`);
  }

  return {
    ok: true,
    hash: cid, 
    id: tx.id,
  }
}

