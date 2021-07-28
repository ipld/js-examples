# ipld-example

**Basic examples of generating IPLD and consuming graphs in JavaScript**

Builds on https://github.com/multiformats/js-multiformats and https://github.com/ipld/js-car, both of which contain a lot more documentation on how this code works. See also https://github.com/ipld/js-car/tree/master/examples for more examples of working with CARs (IPLD block archives).

## How to use?

This example is primarily intended for use in Node.js, but only due to ease of filesystem use. Most of the code contained here will work in the browser, you'll just need to store and retrieve the CAR in a different way.

* Run `npm install` to set up.
* Run `node ipld-example.js` to generate an `example.car` that contains some IPLD blocks, including a full graph whose root is recorded as the CAR's "root", and some unconnected blocks not part of that graph.
* Run `node ipld-example.js inspect` to see a description of `example.car` contains by decoding (and verifying) the blocks and printing their contents to the console.

## License

Licensed under either of

 * Apache 2.0, ([LICENSE-APACHE](LICENSE-APACHE) / http://www.apache.org/licenses/LICENSE-2.0)
 * MIT ([LICENSE-MIT](LICENSE-MIT) / http://opensource.org/licenses/MIT)

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in the work by you, as defined in the Apache-2.0 license, shall be dual licensed as above, without any additional terms or conditions.