const std = @import("std");
const json = std.json;
const schema = @import("json_schema_tools_meta_schema");

const Allocator = std.mem.Allocator;
const SchemaMap = json.ArrayHashMap(schema.JSONSchema);

pub const TraverseOptions = struct {
    skip_first_mutation: bool = false,
    merge_not_mutate: bool = false,
    mutable: bool = false,
    bfs: bool = false,
};

pub const MutationFn = *const fn (ctx: ?*anyopaque, allocator: Allocator, current: schema.JSONSchema, is_root_of_cycle: bool) anyerror!schema.JSONSchema;

const Stack = std.array_list.Managed(*schema.JSONSchemaObject);
const Map = std.AutoHashMap(*schema.JSONSchemaObject, schema.JSONSchema);

const Context = struct {
    allocator: Allocator,
    options: TraverseOptions,
    mutation: MutationFn,
    user_ctx: ?*anyopaque,
    stack: Stack,
    map: Map,

    fn init(allocator: Allocator, mutation: MutationFn, user_ctx: ?*anyopaque, options: TraverseOptions) Context {
        return .{
            .allocator = allocator,
            .options = options,
            .mutation = mutation,
            .user_ctx = user_ctx,
            .stack = Stack.init(allocator),
            .map = Map.init(allocator),
        };
    }

    fn deinit(self: *Context) void {
        self.map.deinit();
        self.stack.deinit();
    }

    fn callMutation(self: *Context, value: schema.JSONSchema, is_root_of_cycle: bool) !schema.JSONSchema {
        return self.mutation(self.user_ctx, self.allocator, value, is_root_of_cycle);
    }

    fn traverse(self: *Context, node: schema.JSONSchema, depth: usize) !schema.JSONSchema {
        return switch (node) {
            .boolean => |value| self.handleBoolean(value, depth),
            .object => |ptr| self.handleObject(ptr, node, depth),
        };
    }

    fn handleBoolean(self: *Context, value: bool, depth: usize) !schema.JSONSchema {
        if (self.options.skip_first_mutation and depth == 0) {
            return schema.JSONSchema{ .boolean = value };
        }
        return try self.callMutation(schema.JSONSchema{ .boolean = value }, false);
    }

    fn handleObject(self: *Context, original_ptr: *schema.JSONSchemaObject, original_node: schema.JSONSchema, depth: usize) !schema.JSONSchema {
        var is_root_of_cycle = false;

        var working_node = if (self.options.mutable) original_node else try self.cloneObject(original_ptr);
        var working_ptr = working_node.object;

        if (self.options.bfs and !(self.options.skip_first_mutation and depth == 0)) {
            const mutated = try self.callMutation(working_node, false);
            switch (mutated) {
                .object => |mut_ptr| {
                    working_node = mutated;
                    working_ptr = mut_ptr;
                },
                .boolean => return mutated,
            }
        }

        try self.stack.append(original_ptr);
        defer _ = self.stack.pop();

        {
            const gop = try self.map.getOrPut(original_ptr);
            gop.value_ptr.* = working_node;
        }
        defer _ = self.map.remove(original_ptr);

        const rec = struct {
            fn apply(ctx: *Context, parent_ptr: *schema.JSONSchemaObject, parent_depth: usize, flag: *bool, child: schema.JSONSchema) !schema.JSONSchema {
                if (ctx.findCycle(child)) |cycle_ptr| {
                    if (cycle_ptr == parent_ptr) flag.* = true;

                    if (ctx.options.skip_first_mutation and ctx.stack.items.len > 0 and cycle_ptr == ctx.stack.items[0]) {
                        const mutated_root = try ctx.callMutation(child, true);
                        if (ctx.map.getPtr(cycle_ptr)) |entry| entry.* = mutated_root;
                        return mutated_root;
                    }

                    if (ctx.map.get(cycle_ptr)) |existing| {
                        return existing;
                    }
                    return child;
                }

                return try ctx.traverse(child, parent_depth + 1);
            }
        }.apply;

        if (original_ptr.anyOf) |list| {
            const new_list = try self.allocator.alloc(schema.JSONSchema, list.len);
            errdefer self.allocator.free(new_list);
            for (list, 0..) |item, idx| {
                new_list[idx] = try rec(self, original_ptr, depth, &is_root_of_cycle, item);
            }
            working_ptr.anyOf = new_list;
        }

        if (original_ptr.allOf) |list| {
            const new_list = try self.allocator.alloc(schema.JSONSchema, list.len);
            errdefer self.allocator.free(new_list);
            for (list, 0..) |item, idx| {
                new_list[idx] = try rec(self, original_ptr, depth, &is_root_of_cycle, item);
            }
            working_ptr.allOf = new_list;
        }

        if (original_ptr.oneOf) |list| {
            const new_list = try self.allocator.alloc(schema.JSONSchema, list.len);
            errdefer self.allocator.free(new_list);
            for (list, 0..) |item, idx| {
                new_list[idx] = try rec(self, original_ptr, depth, &is_root_of_cycle, item);
            }
            working_ptr.oneOf = new_list;
        }

        var items_is_single_schema = false;
        if (original_ptr.items) |items_union| {
            switch (items_union) {
                .schema_array => |arr| {
                    const new_arr = try self.allocator.alloc(schema.JSONSchema, arr.len);
                    errdefer self.allocator.free(new_arr);
                    for (arr, 0..) |item, idx| {
                        new_arr[idx] = try rec(self, original_ptr, depth, &is_root_of_cycle, item);
                    }
                    working_ptr.items = schema.Items{ .schema_array = new_arr };
                },
                .schema => |single| {
                    items_is_single_schema = true;
                    const mutated_single = try rec(self, original_ptr, depth, &is_root_of_cycle, single);
                    working_ptr.items = schema.Items{ .schema = mutated_single };
                },
            }
        }

        if (original_ptr.additionalItems) |additional| {
            if (!items_is_single_schema and Context.truthy(additional)) {
                const mutated = try rec(self, original_ptr, depth, &is_root_of_cycle, additional);
                working_ptr.additionalItems = mutated;
            }
        }

        if (original_ptr.properties) |props| {
            var new_props = SchemaMap{};
            errdefer new_props.deinit(self.allocator);
            var it = props.map.iterator();
            while (it.next()) |entry| {
                const key = entry.key_ptr.*;
                const mutated = try rec(self, original_ptr, depth, &is_root_of_cycle, entry.value_ptr.*);
                try new_props.map.put(self.allocator, key, mutated);
            }
            working_ptr.properties = new_props;
        }

        if (original_ptr.patternProperties) |patterns| {
            var new_patterns = SchemaMap{};
            errdefer new_patterns.deinit(self.allocator);
            var it = patterns.map.iterator();
            while (it.next()) |entry| {
                const key = entry.key_ptr.*;
                const mutated = try rec(self, original_ptr, depth, &is_root_of_cycle, entry.value_ptr.*);
                try new_patterns.map.put(self.allocator, key, mutated);
            }
            working_ptr.patternProperties = new_patterns;
        }

        if (original_ptr.additionalProperties) |additional_props| {
            if (Context.truthy(additional_props)) {
                const mutated = try rec(self, original_ptr, depth, &is_root_of_cycle, additional_props);
                working_ptr.additionalProperties = mutated;
            }
        }

        if (self.options.skip_first_mutation and depth == 0) {
            return working_node;
        }

        if (self.options.bfs) {
            return working_node;
        }

        const mutated_final = try self.callMutation(working_node, is_root_of_cycle);

        if (self.options.merge_not_mutate) {
            switch (mutated_final) {
                .object => |mut_ptr| {
                    working_ptr.* = mut_ptr.*;
                    if (self.map.getPtr(original_ptr)) |entry| entry.* = working_node;
                    return working_node;
                },
                .boolean => return mutated_final,
            }
        }

        if (self.map.getPtr(original_ptr)) |entry| entry.* = mutated_final;
        return mutated_final;
    }

    fn cloneObject(self: *Context, original_ptr: *schema.JSONSchemaObject) !schema.JSONSchema {
        const clone_ptr = try self.allocator.create(schema.JSONSchemaObject);
        clone_ptr.* = original_ptr.*;
        return schema.JSONSchema{ .object = clone_ptr };
    }

    fn findCycle(self: *Context, candidate: schema.JSONSchema) ?*schema.JSONSchemaObject {
        return switch (candidate) {
            .boolean => null,
            .object => |ptr| blk: {
                for (self.stack.items) |stack_ptr| {
                    if (stack_ptr == ptr) break :blk ptr;
                }
                break :blk null;
            },
        };
    }

    fn truthy(value: schema.JSONSchema) bool {
        return switch (value) {
            .boolean => |b| b,
            .object => true,
        };
    }
};

pub fn traverse(allocator: Allocator, root: schema.JSONSchema, ctx: ?*anyopaque, mutation: MutationFn, options: TraverseOptions) !schema.JSONSchema {
    var context = Context.init(allocator, mutation, ctx, options);
    defer context.deinit();
    return try context.traverse(root, 0);
}
