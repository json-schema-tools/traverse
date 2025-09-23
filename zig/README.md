# json-schema-tools Traverse (Zig)

Zig port of the `json-schema-tools/traverse` package. Export the `traverse` routine for iterating over every subschema in a JSON Schema tree while applying user supplied mutations. It depends on the Zig port of `json-schema-tools/meta-schema` for parsing and representing JSON Schema documents.

Build and run tests with:

```
zig build test
```

During development alongside the meta-schema repository you can skip fetching the package by pointing the build to the sibling checkout:

```
zig build test -Duse-local-meta-schema
```
