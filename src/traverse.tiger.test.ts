import traverse, { MutationFunction, TraverseOptions } from "../src/index";
import { SchemaGenerator } from "./generators";
import { JSONSchema } from "@json-schema-tools/meta-schema";
import seedrandom from "seedrandom";

type ASTNode = 
  | { type: 'addProperty', key: string, value: any }
  | { type: 'removeProperty', key: string }
  | { type: 'modifyType', newType: string }
  | { type: 'addEnum', values: any[] }
  | { type: 'addFormat', format: string }
  | { type: 'addPattern', pattern: string }
  | { type: 'addRequired', key: string }
  | { type: 'addItems', items: any }
  | { type: 'addAdditionalProperties', value: boolean | object }
  | { type: 'addMinMax', min?: number, max?: number }
  | { type: 'addMultipleOf', value: number };

function generateRandomASTNode(rng: seedrandom.PRNG): ASTNode {
  const nodeTypes = [
    'addProperty', 'removeProperty', 'modifyType', 'addEnum', 'addFormat',
    'addPattern', 'addRequired', 'addItems', 'addAdditionalProperties',
    'addMinMax', 'addMultipleOf'
  ];
  const selectedType = nodeTypes[Math.floor(rng() * nodeTypes.length)];

  switch (selectedType) {
    case 'addProperty':
      return { type: 'addProperty', key: `prop${Math.floor(rng() * 1000)}`, value: generateRandomValue(rng) };
    case 'removeProperty':
      return { type: 'removeProperty', key: `prop${Math.floor(rng() * 1000)}` };
    case 'modifyType':
      return { type: 'modifyType', newType: ['string', 'number', 'boolean', 'object', 'array'][Math.floor(rng() * 5)] };
    case 'addEnum':
      return { type: 'addEnum', values: Array.from({ length: Math.floor(rng() * 5) + 1 }, () => generateRandomValue(rng)) };
    case 'addFormat':
      return { type: 'addFormat', format: ['date-time', 'email', 'hostname', 'ipv4', 'ipv6', 'uri'][Math.floor(rng() * 6)] };
    case 'addPattern':
      return { type: 'addPattern', pattern: `^[a-z]{${Math.floor(rng() * 5) + 1}}$` };
    case 'addRequired':
      return { type: 'addRequired', key: `prop${Math.floor(rng() * 1000)}` };
    case 'addItems':
      return { type: 'addItems', items: generateRandomValue(rng) };
    case 'addAdditionalProperties':
      return { type: 'addAdditionalProperties', value: rng() > 0.5 ? true : generateRandomValue(rng) };
    case 'addMinMax':
      return { type: 'addMinMax', min: Math.floor(rng() * 10), max: Math.floor(rng() * 90) + 10 };
    case 'addMultipleOf':
      return { type: 'addMultipleOf', value: Math.floor(rng() * 10) + 1 };
    default:
      throw new Error('Unexpected node type');
  }
}

function generateRandomValue(rng: seedrandom.PRNG): any {
  const types = ['string', 'number', 'boolean', 'object', 'array'];
  const type = types[Math.floor(rng() * types.length)];

  switch (type) {
    case 'string':
      return `value${Math.floor(rng() * 1000)}`;
    case 'number':
      return Math.floor(rng() * 1000);
    case 'boolean':
      return rng() > 0.5;
    case 'object':
      return { [`key${Math.floor(rng() * 100)}`]: generateRandomValue(rng) };
    case 'array':
      return Array.from({ length: Math.floor(rng() * 3) + 1 }, () => generateRandomValue(rng));
  }
}

function applyASTNode(schema: any, node: ASTNode): any {
  switch (node.type) {
    case 'addProperty':
      return { ...schema, properties: { ...schema.properties, [node.key]: node.value } };
    case 'removeProperty':
      const { [node.key]: _, ...rest } = schema.properties || {};
      return { ...schema, properties: rest };
    case 'modifyType':
      return { ...schema, type: node.newType };
    case 'addEnum':
      return { ...schema, enum: node.values };
    case 'addFormat':
      return { ...schema, format: node.format };
    case 'addPattern':
      return { ...schema, pattern: node.pattern };
    case 'addRequired':
      return { ...schema, required: [...(schema.required || []), node.key] };
    case 'addItems':
      return { ...schema, items: node.items };
    case 'addAdditionalProperties':
      return { ...schema, additionalProperties: node.value };
    case 'addMinMax':
      return { ...schema, minimum: node.min, maximum: node.max };
    case 'addMultipleOf':
      return { ...schema, multipleOf: node.value };
    default:
      return schema;
  }
}

export const runTest = (seed: string) => {
  const generator = new SchemaGenerator(seed);
  const schema = generator.generateSchema();
  const options = generator.generateTraverseOptions();
  const mutatedPaths: string[] = [];
  const mutationTypes: { [path: string]: 'inPlace' | 'copy' } = {};
  const rng = seedrandom(seed);

  const mutation: MutationFunction = (s, isCycle, path) => {
    if (typeof s === "object" && s !== null) {
      mutatedPaths.push(path);
      const numMutations = Math.floor(rng() * 3) + 1; // Apply 1-3 mutations
      const shouldModifyInPlace = rng() < 0.5; // 50% chance to modify in place
      mutationTypes[path] = shouldModifyInPlace ? 'inPlace' : 'copy';
      let mutatedSchema = shouldModifyInPlace ? s : { ...s };
      
      for (let i = 0; i < numMutations; i++) {
        const astNode = generateRandomASTNode(rng);
        mutatedSchema = applyASTNode(mutatedSchema, astNode);
      }
      
      return mutatedSchema;
    }
    return s;
  };

  const result = traverse(schema, mutation, options);

  return { seed, schema, result, options, mutatedPaths, mutationTypes };
};

describe("TigerStyle traverse tests", () => {

  const testCases = [
    { seed: "test1", description: "Simple schema" },
    { seed: "test2", description: "Complex nested schema" },
    { seed: "test3", description: "Schema with arrays" },
    // Add more test cases as needed
  ];

  testCases.forEach(({ seed, description }) => {
    it(`should produce deterministic results for ${description} (seed: ${seed})`, () => {
      const run1 = runTest(seed);
      const run2 = runTest(seed);

      expect(run1.schema).toEqual(run2.schema);
      expect(run1.result).toEqual(run2.result);
      expect(run1.options).toEqual(run2.options);
    });
  });
});
