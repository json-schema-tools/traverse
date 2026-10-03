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
 - synchronous unless a mutation callback returns a promise or thenable
 - doesn't touch the filesystem or make network requests itself
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

By default, the callback must return a schema on every call, even when it only
reads or logs the node. Return the supplied schema to keep it, or return another
schema (including `true` or `false`) to replace it. Returning `undefined` or
omitting the return throws a `TypeError` that includes the node path.

To allow callbacks that only inspect or edit nodes in place, set
`allowUndefinedReturn: true`. An undefined return then keeps the node passed to
the callback, including any in-place edits. With immutable traversal (the
default), this keeps the working copy rather than the original input node.
Returning `undefined` never removes a subschema.

```js
traverse(mySchema, (schemaOrSubschema, isCycle, path) => {
  console.log(path);
}, { allowUndefinedReturn: true });
```

### Async mutators

The same `traverse` function supports synchronous, asynchronous, and mixed
callbacks. It returns a schema immediately when every invoked callback returns
synchronously. Once a callback returns a promise or thenable, it returns a
promise that resolves to the completed root schema, including replacements:

```ts
// Synchronous callbacks keep the synchronous API.
const result = traverse(mySchema, node => node);

// Awaiting works for both synchronous and asynchronous traversals.
const enriched = await traverse(mySchema, async node => {
  const title = await lookupTitle(node);
  return typeof node === "boolean" ? node : { ...node, title };
});

// Only visits needing asynchronous work return a promise.
const mixed = traverse(mySchema, node => {
  if (typeof node === "object" && node["x-model"]) {
    return enrichModel(node);
  }
  return node;
});
```

Traversal awaits each callback before continuing to the next node. By default,
parents receive their children's resolved replacements. With `bfs: true`, the
parent callback finishes before child discovery starts, and siblings are visited
before grandchildren. A replacement of `true` or `false` ends traversal of that
node's children. Paths, custom subschemas, and cycle/shared-reference handling
are preserved.
An async callback that is never invoked (for example, on a skipped leaf root)
does not cause a promise return. The `additionalSubschemas` selector itself
remains synchronous.

Returning a promise that resolves to `undefined` follows the same
`allowUndefinedReturn` policy as a synchronous undefined return. A failure before
the first promise throws synchronously; failures after traversal becomes
asynchronous reject the returned promise and stop further callbacks. With
`mutable: true`, edits completed before a failure are not rolled back.

TypeScript infers `JSONSchema` for synchronous callbacks and
`JSONSchema | Promise<JSONSchema>` for callbacks that can return promises. The
union also covers traversals where every async callback is skipped. The exported
`MutationFunction` accepts both kinds of callback; `SyncMutationFunction` keeps
the synchronous return type for explicitly annotated callbacks.

### Advanced Options

`traverse` accepts an optional options object as the third argument. Some useful
flags include:

- `pathFormat` - `"jsonpath"` (default) or `"jsonpointer"` for callback paths
- `bfs` - visit schemas level by level, calling parents before children and
  siblings before grandchildren. Results are applied sequentially, including
  awaited results. The default remains depth-first postorder.
- `allowUndefinedReturn` - keep the callback's node when it returns `undefined`
  or nothing. Defaults to `false`, which throws an error for undefined returns.
- `skipFirstMutation` - do not call the mutation function on the root schema
- `additionalSubschemas` - select custom subschemas using paths relative to each object schema
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

### Custom subschemas

Use `additionalSubschemas` to declare schema locations under custom keywords.
Each descriptor has a non-empty `path` of literal property names and array
indices, relative to the object schema passed to the selector:

```ts
const schema = {
  type: "object",
  properties: { ordinary: { type: "string" } },
  "x-models": {
    response: { type: "array", items: { type: "number" } },
    disabled: false,
  },
};

traverse(schema, (subschema, isCycle, path, parent) => {
  console.log(path);
  return subschema;
}, {
  additionalSubschemas(node) {
    return Object.keys(node["x-models"] ?? {}).map(name => ({
      path: ["x-models", name],
    }));
  },
});
```

This visits the ordinary property, both custom schemas, the response's `items`,
and the root. The `x-models` map is a container, so it does not receive a mutation
callback. Custom children use the same mutation, path formatting, parent schema,
and cycle/shared-reference behavior as built-in children. Array entries can be
selected with paths such as `["x-models", "responses", 0]`.

The selector runs once for each visited object schema, on the input node after
the parent callback (when `bfs: true`) and before its children are mutated.
Boolean schemas do not invoke the selector. Treat the selector's input as
read-only. Custom children are visited recursively; each object child can select
more custom children. Built-in children are discovered first, followed by custom
children in selector order. Overlapping ancestor/descendant selections are
forwarded through the ancestor so each location is visited once.

Duplicate paths, including overlaps with built-in locations, do not cause extra
visits. Numeric array indices and their string equivalents identify the same
location. Paths are independent of `pathFormat`; names containing dots, slashes,
or tildes are literal names, not JSONPath or JSON Pointer expressions.

Every target must exist as an own property and be an object or boolean schema.
Missing paths, invalid segments, and targets such as arrays, strings, numbers,
or `null` throw a `TypeError` with the location. Intermediate objects and arrays
are copied as needed in immutable mode. Unselected extension data is preserved
without being traversed. Selecting a value explicitly declares it to be a
schema; this option does not validate its contents or dereference `$ref` values.

The `AdditionalSubschema` and `AdditionalSubschemas` types are exported for typed
selectors. Omit the option to retain the existing traversal behavior.

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
