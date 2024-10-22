import { JSONSchema } from "@json-schema-tools/meta-schema";
import seedrandom from "seedrandom";
import { TraverseOptions } from "./index";

export class SchemaGenerator {
  private rng: seedrandom.PRNG;

  constructor(seed: string) {
    this.rng = seedrandom(seed);
  }

  generateSchema(depth: number = 0): JSONSchema {
    const types = ["object", "array", "string", "number", "boolean", "null"] as const;
    const type = types[Math.floor(this.rng() * types.length)];

    switch (type) {
      case "object":
        return this.generateObjectSchema(depth);
      case "array":
        return this.generateArraySchema(depth);
      default:
        return { type: type };
    }
  }

  generateTraverseOptions(): TraverseOptions {
    return {
      skipFirstMutation: this.rng() > 0.5,
      mergeNotMutate: this.rng() > 0.5,
      mutable: this.rng() > 0.5,
      bfs: this.rng() > 0.5,
    };
  }

  private generateObjectSchema(depth: number): JSONSchema {
    const properties: Record<string, JSONSchema> = {};
    const propertyCount = Math.floor(this.rng() * 5) + 1;

    for (let i = 0; i < propertyCount; i++) {
      const propertyName = `prop${i}`;
      properties[propertyName] = depth < 3 ? this.generateSchema(depth + 1) : { type: "string" };
    }

    return {
      type: "object",
      properties,
      required: Object.keys(properties).filter(() => this.rng() > 0.5)
    };
  }

  private generateArraySchema(depth: number): JSONSchema {
    return {
      type: "array",
      items: depth < 3 ? this.generateSchema(depth + 1) : { type: "string" }
    };
  }
}
