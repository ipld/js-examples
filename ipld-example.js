// `npm install` to set up
//
// run with `node ipld-example.js` to generate an `example.car` that contains a graph(ish)
//
// run with `node ipld-example.js inspect` to see what `example.car` contains
//

import fs from 'fs'
import { Readable } from 'stream'

// js-multiformats basic pieces for dealing with blocks and CIDs
import { CID } from 'multiformats/cid'
import * as Block from 'multiformats/block'

// Multihashers
import { sha256 } from 'multiformats/hashes/sha2'
// some other multihashers that may be of interest:
// import { blake2b256 } from '@multiformats/blake2/blake2b'
// import { sha3256 } from '@multiformats/sha3'
// import { sha3512 } from '@multiformats/sha3'
// see https://github.com/multiformats/js-multiformats#multihash-hashers-1

// IPLD codecs
import * as raw from 'multiformats/codecs/raw'
import * as dagJSON from '@ipld/dag-json'
import * as dagCBOR from '@ipld/dag-cbor'
// some other codecs that may be of interest:
// import * as json from 'multiformats/codecs/json'
// import * as dagPB from '@ipld/dag-pb'
// import * as dagJOSE from 'dag-jose'
// see https://github.com/multiformats/js-multiformats#ipld-codecs-multicodec

// CAR utilities, see https://github.com/ipld/js-car for more info
import { CarWriter } from '@ipld/car/writer'
import { CarReader } from '@ipld/car/reader'

const utf8Encoder = new TextEncoder()
const utf8Decoder = new TextDecoder()

// Main entry point
if (process.argv[2] === 'inspect') {
  // ran with `node ipld-example.js inspect`
  inspect().catch((err) => {
    console.error(err)
    process.exit(1)
  })
} else {
  // ran with `node ipld-example.js`
  run().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

async function run () {
  const { blocks, roots } = await createBlocks()
  await write(blocks, roots)
}

/**
 * Make an arbitrary DAG with different types of IPLD blocks, plus a couple of
 * non-linked blocks and return all blocks plus the root of the DAG we want
 * to record
 *
 * @returns {Promise<{blocks: {cid: CID, bytes: Uint8Array}[], roots: CID[]}>}
 */
async function createBlocks () {
  /** @type {{cid: CID, bytes: Uint8Array}[]} */
  const blocks = []

  // A link to some data _elsewhere_
  const externalLink = CID.parse('QmV88khHDJEXi7wo6o972MZWY661R9PhrZW6dvpFP6jnMn')

  // Two leaf nodes with raw bytes, no links
  const leafRaw1 = await Block.encode({
    value: utf8Encoder.encode('🌲 leaf node of raw bytes 🌴'),
    hasher: sha256,
    codec: raw
  })
  blocks.push(leafRaw1)
  const leafRaw2 = await Block.encode({
    value: utf8Encoder.encode('🌲🌲🌲🌲🌲🌲🌲🌲🌲🌲🌲🌲🌲🌴🌴🌴🌴🌴🌴🌴🌴🌴'),
    hasher: sha256,
    codec: raw
  })
  blocks.push(leafRaw2)

  // A parent that bundles the two leafs into an array inside a map encoded in dag-cbor
  const parent = await Block.encode({
    value: {
      name: 'parent of some weird children',
      children: [leafRaw1.cid, leafRaw2.cid],
      favouriteChild: leafRaw2.cid
    },
    hasher: sha256,
    codec: dagCBOR
  })
  blocks.push(parent)

  // A list containing links to the 3 local blocks above, encoded in dag-json
  const lister = await Block.encode({
    value: [parent.cid, leafRaw1.cid, leafRaw2.cid],
    hasher: sha256,
    codec: dagJSON
  })
  blocks.push(lister)

  // A list containing 2 maps which conntain links to the two previous blocks,
  // plus an additional bare CID to something external.
  // This forms our main DAG "root" from which we can reference traverse to
  // all of the other linked blocks.
  const grandparent = await Block.encode({
    value: [
      { name: 'parent', link: parent.cid },
      { name: 'lister', link: lister.cid },
      externalLink
    ],
    hasher: sha256,
    codec: dagCBOR
  })
  blocks.push(grandparent)

  // A dangling node that points to one of the leaf nodes using a map
  const evergreenPointer = await Block.encode({
    value: {
      data: leafRaw2.cid,
      startByte: 0,
      endByte: 52
    },
    hasher: sha256,
    codec: dagCBOR
  })
  blocks.push(evergreenPointer)

  // A second dangling node that points to one of the leaf nodes using a map
  const palmsPointer = await Block.encode({
    value: {
      data: leafRaw2.cid,
      startByte: 52,
      endByte: 88
    },
    hasher: sha256,
    codec: dagCBOR
  })
  blocks.push(palmsPointer)

  // Return `grandparent` as the root of the graph and also all blocks we
  // created, this leaves the last two blocks as _not_ part of the graph that starts
  // with the `grandparent` root. We could include them in the roots array if we
  // wanted to be pedantic: `[grandparent.cid, evergreenPointer.cid, palmsPointer.cid]`.
  return { blocks, roots: [grandparent.cid] }
}

/**
 * Write the blocks to a CAR file
 *
 * @param {{cid: CID, bytes: Uint8Array}[]} blocks
 * @param {CID[]} roots
 */
async function write (blocks, roots) {
  const { writer, out } = await CarWriter.create(roots)
  Readable.from(out).pipe(fs.createWriteStream('example.car'))

  for (const block of blocks) {
    await writer.put(block)
  }

  await writer.close()
}

/**
 * Inspect a CAR file, printing out its roots and its decoded block contents
 */
async function inspect () {
  // Mappings for the codecs and hashers we have available. We have to do manual
  // look-up using the CID we retrieve from the CAR file in order to decode and
  // verify blocks. If we are expecting other codecs or hash functions then we
  // should add them here.
  /** @type {{[code: number]: import("multiformats/codecs/interface").BlockCodec<number, any>}} */
  const codecs = {
    [dagCBOR.code]: dagCBOR,
    [dagJSON.code]: dagJSON,
    [raw.code]: raw
  }
  /** @type {{[code: number]: import("multiformats/hashes/interface").MultihashHasher}} */
  const hashes = {
    [sha256.code]: sha256
  }

  const inStream = fs.createReadStream('example.car')
  const reader = await CarReader.fromIterable(inStream)

  console.log('Roots:', await reader.getRoots())

  let i = 1
  for await (const { cid, bytes } of reader.blocks()) {
    // Get the correct codec and hasher for this block
    if (!(cid.code in codecs)) {
      throw new Error(`Unknown codec: 0x${cid.code.toString(16)}`)
    }
    if (!(cid.multihash.code in hashes)) {
      throw new Error(`Unknown multihash codec: 0x${cid.multihash.code.toString(16)}`)
    }

    // Decode the block by "creating" it since we have bytes, CID, codec and
    // hasher - this will verify that the bytes match the CID and also
    // give us the `value` of the block once decoded.
    // We could also use `Block.decode({ bytes, codec, hasher })` to generate
    // `value`, which would also give us `cid` which we could compare to our
    // expected `cid`.
    const block = await Block.create({ cid, bytes, codec: codecs[cid.code], hasher: hashes[cid.multihash.code] })

    console.log(`Block #${i++}: (${codecs[cid.code].name}) ${cid.toString()}:`)
    // So we can print it nicely, decode any block that is plain bytes (usually
    // 'raw' blocks but other codecs can encode just bytes as well.
    const value = block.value instanceof Uint8Array ? `Bytes<${utf8Decoder.decode(block.value)}>` : block.value
    console.log(value)
  }
}
