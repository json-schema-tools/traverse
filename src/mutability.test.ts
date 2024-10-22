// Required imports
import traverse, { TraverseOptions } from './';
import { JSONSchema } from '@json-schema-tools/meta-schema';

// Example schemas for testing
const exampleSchema: JSONSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'number' },
  },
};

// Test cases for different behaviors
describe('traverse mutability behavior', () => {
  it('should modify the original schema when mutable is true and mutation modifies properties directly', () => {
    const mutableSchema = { ...exampleSchema };
    const mutationFn = (schema: any) => {
      if (typeof schema === 'object' && schema.type === 'string') {
        schema.type = 'number'; // Directly modify the schema
      }
      return schema;
    };

    traverse(mutableSchema, mutationFn, { mutable: true } as TraverseOptions);

    expect(mutableSchema.properties?.name.type).toBe('number'); // Original schema is modified
  });

  it('should not modify the original schema when mutable is false and mutation modifies properties directly', () => {
    const mutableSchema = { ...exampleSchema };
    const mutationFn = (schema: any) => {
      if (typeof schema === 'object' && schema.type === 'string') {
        schema.type = 'number'; // Directly modify the schema
      }
      return schema;
    };

    const result: any = traverse(mutableSchema, mutationFn, { mutable: false } as TraverseOptions);

    expect(mutableSchema.properties?.name.type).toBe('string'); // Original schema remains unchanged
    expect(result.properties.name.type).toBe('number'); // Modified copy
  });

  it('should replace the schema with a new object when mutation returns a new schema (mutable true)', () => {
    const mutableSchema = { ...exampleSchema };
    const mutationFn = (schema: any) => {
      if (typeof schema === 'object' && schema.type === 'string') {
        return { ...schema, type: 'boolean' }; // Return a new object
      }
      return schema;
    };

    traverse(mutableSchema, mutationFn, { mutable: true } as TraverseOptions);

    expect(mutableSchema.properties?.name.type).toBe('boolean'); // Original schema is replaced
  });

  it('should replace the schema with a new object when mutation returns a new schema (mutable false)', () => {
    const mutableSchema = { ...exampleSchema };
    const mutationFn = (schema: any) => {
      if (typeof schema === 'object' && schema.type === 'string') {
        return { ...schema, type: 'boolean' }; // Return a new object
      }
      return schema;
    };

    const result: any = traverse(mutableSchema, mutationFn, { mutable: false } as TraverseOptions);

    expect(mutableSchema.properties?.name.type).toBe('string'); // Original schema remains unchanged
    expect(result.properties.name.type).toBe('boolean'); // Modified copy
  });

  it('should skip the first mutation when skipFirstMutation is true', () => {
    const mutableSchema = { ...exampleSchema };
    const mutationFn = (schema: any) => {
      if (typeof schema === 'object' && schema.type) {
        schema.type = 'null'; // Directly modify the schema
      }
      return schema;
    };

    const result: any = traverse(mutableSchema, mutationFn, { skipFirstMutation: true } as TraverseOptions);

    expect(result.type).toBeUndefined(); // Root is not mutated
    expect(result.properties.name.type).toBe('null'); // Subschemas are mutated
  });

  it('should traverse in breadth-first manner when bfs is true', () => {
    const bfsSchema: JSONSchema = {
      type: 'object',
      properties: {
        nested: {
          type: 'object',
          properties: {
            deep: { type: 'string' },
          },
        },
      },
    };

    const order: string[] = [];
    const mutationFn = (schema: any) => {
      if (typeof schema === 'object' && schema.type) {
        order.push(schema.type);
      }
      return schema;
    };

    traverse(bfsSchema, mutationFn, { bfs: true } as TraverseOptions);

    expect(order).toEqual(['object', 'object', 'string']); // Breadth-first order
  });
});
