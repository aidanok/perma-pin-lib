
Perma-Pin library
=====================

Library to upload & pin ipfs content to the Arweave blockchain. 

- API to upload new files to both IPFS and Arweave at the same.
- API to permafiy files already on IPFS by uploading them to Arweave. 
- Detects when a file has already been uploaded to Arweave and does not re-upload
- Verifies the content stored in Arweave is the same content as on IPFS before deciding not to upload to Arweave. 
- Detects content type of files on IPFS to add a Content-Type tag the Arweave transaction. 
- Helper method to check for pending Arweave uploads even with (most) block propogation delays.
 
Published in ESM & CommonJs module formats with TypeScript types.

Library methods have JsDoc describing their usage, and are in TypeScript so you get all
that intellisense goodness.

Published on Arweave Blockchain:

`npm install https://264jv34znqff.arweave.net/b_yXsaW6fy9_QJsGhSyWFTakEgZL1GKFF0UHscmPUzA`


### Related To

- [https://github.com/aokisok/perma-pin-http/](https://github.com/aokisok/perma-pin-http/)
- [https://github.com/aokisok/perma-pin-ui/](https://github.com/aokisok/perma-pin-ui/)

This library is perfectly suitable for use in your NodeJs/TypeScript/Browser project directly. 

There is Public API & Service @ 

- [https://perma-pin.bloc.space](https://perma-pin.bloc.space)

### Wallet setup

To use this library, you will need an Arweave wallet stored in an environment varible AR_WALLET_JSON: 

```bash
export AR_WALLET_JSON=$(cat /path/to/mywallet.json)
```

## Quick Examples  


### Permafiy New Content to IPFS & Arweave 

```typescript

import { permafiyFile } from '@perma-ipfs/lib' 

// ... later, in an async function.
// ... content type is optional. 

const result =  await permafiyFile(myFileBuffer, 'image/png');

result.id // arweave tx id 
result.hash // ipfs cid (same as passed in) 
result.alreadyPinned // set to true if the file was already uploaded to Arweave


// You can obtain the content-type however you want, there is a helper function 
// included to detect it from a Buffer or Uint8Array of bytes. `

```


### Permafiy Existing Content

```typescript

import { permafiyExisting } from '@perma-ipfs/lib' 

// ... later, in an async function 
const cid: string = 'xyz'; // A valid IPFS CID pointing a file already available on IPFS. 
const result = await permafiyExisting(cid);

result.id // arweave tx id 
result.hash // ipfs cid (same as passed in) 
result.alreadyPinned // set to true if the file was already uploaded to Arweave


// Using this method will attempt to detect the mime type of the file and set the approriate Content-Type
// when posting the transaction to the Arweave blockchain. 

```

### Permafiy Multiple IPFS hashes 

```typescript

import { permaifyManyExisting } from '@perma-ipfs/lib' 

// ... later, in an async function 
const cids: string[] = []; // lots and lots of IPFS Hashes. 
const result = await permafiyExisting(cid);

// Using this method will permafiy many IPFS hashes in batches of 10, eventually
// giving you back an array of objects in the same format as other the above API methods. 


```


At present, only singe files, 10MiB and under are supported.
  

