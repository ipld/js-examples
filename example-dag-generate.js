// `npm install` to set up
//
// run with `node example-dag-generate.js` to generate an `example.car` that contains a graph(ish)
//
// run with `node example-dag-generate.js inspect` to see what `example.car` contains
//

const fs = require('fs')

const CarDatastore = require('datastore-car')
const Block = require('@ipld/block')
const CID = require('cids')

// main entry point
if (process.argv[2] === 'inspect') {
  // ran with `node example-dag-generate.js inspect`
  inspect().catch((err) => {
    console.error(err)
    process.exit(1)
  })
} else {
  // ran with `node example-dag-generate.js`
  run().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

// make an arbitrary graph with some weird links
async function run () {
  const blocks = []

  // a link to some data _elsewhere_
  const externalLink = new CID('QmV88khHDJEXi7wo6o972MZWY661R9PhrZW6dvpFP6jnMn')

  // two leaf nodes with raw bytes, no links
  const leafRaw1 = Block.encoder(Buffer.from('🌲 leaf node of raw bytes 🌴'), 'raw')
  blocks.push(leafRaw1)
  const leafRaw2 = Block.encoder(Buffer.from('🌲🌲🌲🌲🌲🌲🌲🌲🌲🌲🌲🌲🌲🌴🌴🌴🌴🌴🌴🌴🌴🌴'), 'raw')
  blocks.push(leafRaw2)

  // a parent that bundles the two leafs into an array inside a map encoded in dag-cbor
  const parent = Block.encoder({
    name: 'parent of some weird children',
    children: [await leafRaw1.cid(), await leafRaw2.cid()],
    favouriteChild: await leafRaw2.cid()
  }, 'dag-cbor')
  blocks.push(parent)

  // a list containing links to the 3 local blocks above, encoded in dag-json
  const lister = Block.encoder([await parent.cid(), await leafRaw1.cid(), await leafRaw2.cid()], 'dag-json')
  blocks.push(lister)

  // a list containing 2 maps which conntain links to the two previous blocks, plus an additional bare CID
  // to something external
  const grandparent = Block.encoder([
    { name: 'parent', link: await parent.cid() },
    { name: 'lister', link: await lister.cid() },
    externalLink
  ], 'dag-cbor')
  blocks.push(grandparent)

  // a dangling node that points to one of the leaf nodes using a map
  const evergreenPointer = Block.encoder({
    data: await leafRaw2.cid(),
    startByte: 0,
    endByte: 52
  }, 'dag-cbor')
  blocks.push(evergreenPointer)

  // a second dangling node that points to one of the leaf nodes using a map
  const palmsPointer = Block.encoder({
    data: await leafRaw2.cid(),
    startByte: 52,
    endByte: 88
  }, 'dag-cbor')
  blocks.push(palmsPointer)

  // write with the `grandparent` as the root of the graph, but push all blocks we
  // created, this leaves the last two blocks as _not_ part of the graph that starts
  // with the `grandparent` root. We could include them in the roots array if we
  // wanted to be pedantic: `[await grandparent.cid(), await evergreenPointer.cid(), await palmsPointer.cid()]`
  await write(blocks, [await grandparent.cid()])
}

// write the blocks to a CAR file
async function write (blocks, roots) {
  const outStream = fs.createWriteStream('example.car')
  const writeDs = await CarDatastore.writeStream(outStream)

  await writeDs.setRoots(roots)

  for (const block of blocks) {
    await writeDs.put(await block.cid(), await block.encode())
  }

  await writeDs.close()
}

// ignore this, it's just a way of making JSON print CIDs nicely for human consumption
function jsonCIDReplacer (key, value) {
  if (typeof value === 'object' &&
      typeof value.codec === 'string' &&
      typeof value.version === 'number' &&
      Buffer.isBuffer(value.hash)) {
    return `CID<${new CID(value.version, value.codec, value.hash).toString()}>`
  }
  return value
}

// inspect a CAR file, printing out its roots and its decoded block contents
async function inspect () {
  const inStream = fs.createReadStream('example.car')
  const readDs = await CarDatastore.readStreaming(inStream)

  console.log('Roots:', (await readDs.getRoots()).map((cid) => cid.toString()))

  let i = 1
  for await (const { key, value } of readDs.query()) {
    // `key` is a string form of a CID, to make it compatible with the Datastore interface
    // `value` is the bytes of the block
    // so we can reconstitute a `Block` from the two
    const cid = new CID(key)
    const block = Block.create(value, cid)

    console.log(`Block #${i++}: (${block.codec}) ${cid.toString()}`)
    if (block.codec === 'raw') {
      // we happen to know our raw blocks are UTF8 so this is fine, otherwise `toString('hex')` would be a good idea
      console.log(block.decode().toString())
    } else {
      // `block.decode()` gives us the object form of the block, so JSON stringify it so we can see it
      console.log(`${JSON.stringify(block.decode(), jsonCIDReplacer, 2)}`)
    }
    console.log()
  }
}
