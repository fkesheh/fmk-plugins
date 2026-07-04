# Vendored dependency

`kiwi.js` is the compiled bundle of [`kiwi-schema`](https://github.com/evanw/kiwi)
v0.5.0 by Evan Wallace, MIT licensed. It is vendored here (rather than pulled
from npm) so this skill decodes `.fig` files with zero network access and no
`npm install` step. Kiwi is Figma's own binary serialization format, which is
why its reference decoder reads `.fig` document trees directly.

To refresh: `npm pack kiwi-schema@<version>`, extract, and copy `kiwi.js` here.
