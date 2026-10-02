# JSON Schema Traverse

<center>
  <span>
    <img alt="GitHub Actions CI" src="https://github.com/json-schema-tools/traverse/actions/workflows/ci.yml/badge.svg?branch=master">
    <img alt="npm" src="https://img.shields.io/npm/dt/@json-schema-tools/traverse.svg" />
    <img alt="GitHub release" src="https://img.shields.io/github/release/json-schema-tools/traverse.svg" />
    <img alt="GitHub commits since latest release" src="https://img.shields.io/github/commits-since/json-schema-tools/traverse/latest.svg" />
  </span>
</center>

This package exports a method that will traverse a JSON-Schema, calling a "mutation" function for each sub schema found. It is useful for building tools to work with JSON Schemas.

## Features

 - circular reference detection & handling
 - synchronous - doesn't touch the filesystem or make network requests.
 - easily perform schema mutations while traversing
 - optional mutability (toggle updating original schema object)
 - returns [JSONPaths](https://www.ietf.org/archive/id/draft-goessner-dispatch-jsonpath-00.html) as it traverses

## Getting Started

```sh
npm install @json-schema-tools/traverse
```

```js
const traverse = require("@json-schema-tools/traverse").default;
//import traverse from "@json-schema-tools/traverse"

const mySchema = {
  title: "baz",
  type: "object",
  properties: {
    foo: {
      title: "foo",
      type: "array",
      items: { type: "string" }
    },
    bar: {
      title: "bar",
      anyOf: [
        { title: "stringerific", type: "string" },
        { title: "numberoo", type: "number" }
      ]
    }
  }
};

traverse(mySchema, (schemaOrSubschema) => {
  console.log(schemaOrSubschema.title);
  return schemaOrSubschema;
});
```

The callback must return a schema on every call, even when it only reads or logs
the node. Return the supplied schema to keep it, or return another schema
(including `true` or `false`) to replace it. Omitting the return produces
`undefined`, which is not a valid schema and can cause traversal to fail.

### Advanced Options

`traverse` accepts an optional options object as the third argument. Some useful
flags include:

- `pathFormat` - `"jsonpath"` (default) or `"jsonpointer"` for callback paths
- `bfs` - call the callback before visiting a schema's children (preorder).
  Despite its name, this currently uses depth-first traversal, not level-by-level
  breadth-first traversal. The default calls the callback after the children.
- `skipFirstMutation` - do not call the mutation function on the root schema
- `mergeNotMutate` - merge the mutation result back into the original schema

```js
traverse(mySchema, (schemaOrSubschema) => {
  console.log(schemaOrSubschema.title);
  return schemaOrSubschema;
}, {
  bfs: true,
  skipFirstMutation: true,
  mergeNotMutate: true,
});
```

## API Docs

The full TypeDoc generated API documentation is available at
[https://json-schema-tools.github.io/traverse/](https://json-schema-tools.github.io/traverse/).

### Contributing

How to contribute, build and release are outlined in [CONTRIBUTING.md](CONTRIBUTING.md), [BUILDING.md](BUILDING.md) and [RELEASING.md](RELEASING.md) respectively. Commits in this repository follow the [CONVENTIONAL_COMMITS.md](CONVENTIONAL_COMMITS.md) specification.

### Callback paths

The callback's third argument is a JSONPath identifying the visited schema.
Simple member names use dot notation (`$.properties.foo`), array indices use
brackets (`$.items[0]`), and other names use JSON-escaped double-quoted brackets
(`$.properties["a.b"]`). The root path is `$`.

Select JSON Pointer with `pathFormat: "jsonpointer"`:

```js
traverse(mySchema, (schema, isCycle, path) => {
  console.log(path); // e.g. /properties/foo/items
  return schema;
}, { pathFormat: "jsonpointer" });
```

JSON Pointer paths use the [RFC 6901](https://www.rfc-editor.org/rfc/rfc6901)
string representation: the root is `""`, array indices are separate tokens
(`/items/0`), and member names escape `~` as `~0` and `/` as `~1`.
An empty property name is preserved (`/properties/`). These paths identify
locations within the input schema; they are not instance paths or URI fragments.
Omitting `pathFormat` preserves JSONPath output.
