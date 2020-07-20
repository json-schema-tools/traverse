# JSON Schema Traverse

This package exports a method that will traverse a JSON-Schema, calling a "mutation" function for each sub schema found. It is useful for building tools to work with JSON Schemas.

## Features

 - circular reference detection & handling
 - synchronous - doesn't touch the filesystem or make network requests.
 - easily perform schema mutations while traversing
 - optional mutability (toggle updating original schema object)

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
});
```

## Features Todo

 - unevaluatedItems (https://json-schema.org/draft/2019-09/json-schema-core.html#rfc.section.9.3.1.3)
 - unevaluatedProperties (https://json-schema.org/draft/2019-09/json-schema-core.html#rfc.section.9.3.2.4)
 - contains (https://json-schema.org/draft/2019-09/json-schema-core.html#rfc.section.9.3.1.4)
 - propertyNames (https://json-schema.org/draft/2019-09/json-schema-core.html#rfc.section.9.3.2.5)

### Contributing

How to contribute, build and release are outlined in [CONTRIBUTING.md](CONTRIBUTING.md), [BUILDING.md](BUILDING.md) and [RELEASING.md](RELEASING.md) respectively. Commits in this repository follow the [CONVENTIONAL_COMMITS.md](CONVENTIONAL_COMMITS.md) specification.
