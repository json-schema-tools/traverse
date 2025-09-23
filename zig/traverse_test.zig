const std = @import("std");
const traverse = @import("json_schema_tools_traverse");
const schema = @import("json_schema_tools_meta_schema");
const json = std.json;
const mem = std.mem;

const Allocator = std.mem.Allocator;
const SchemaMap = json.ArrayHashMap(schema.JSONSchema);
const PropertyEntry = struct {
    key: []const u8,
    value: schema.JSONSchema,
};
const MutCtx = struct {
    call_count: usize = 0,
};

const OrderCtx = struct {
    order: *std.ArrayList([]const u8),
};

test "traverse mutates simple schema once" {
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();
    const allocator = arena.allocator();

    const root = try makeEmptyObject(allocator);

    var ctx = MutCtx{};
    _ = try traverse.traverse(allocator, root, &ctx, countingMutation, .{});

    try std.testing.expectEqual(@as(usize, 1), ctx.call_count);
}

test "traverse visits properties" {
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();
    const allocator = arena.allocator();

    const root = try makeEmptyObject(allocator);
    const root_ptr = root.object;
    const child_a = try makeEmptyObject(allocator);
    const child_b = try makeEmptyObject(allocator);

    root_ptr.properties = try buildProperties(allocator, &[_]PropertyEntry{
        .{ .key = "a", .value = child_a },
        .{ .key = "b", .value = child_b },
    });

    var ctx = MutCtx{};
    _ = try traverse.traverse(allocator, root, &ctx, countingMutation, .{});

    try std.testing.expectEqual(@as(usize, 3), ctx.call_count);
}

test "merge_not_mutate merges mutated object" {
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();
    const allocator = arena.allocator();

    const root = try makeEmptyObject(allocator);
    const root_ptr = root.object;
    root_ptr.title = try allocator.dupe(u8, "root");

    const result = try traverse.traverse(allocator, root, null, mergeMutation, .{ .merge_not_mutate = true });

    switch (result) {
        .object => |ptr| {
            try std.testing.expect(ptr.title != null);
            const props = ptr.properties orelse return error.UnexpectedResult;
            const added = props.map.get("added") orelse return error.UnexpectedResult;
            _ = added;
        },
        .boolean => |_| return error.UnexpectedResult,
    }

    // Original schema should remain without properties.
    try std.testing.expect(root_ptr.properties == null);
}

test "additionalProperties true is visited" {
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();
    const allocator = arena.allocator();

    const root = try makeEmptyObject(allocator);
    const root_ptr = root.object;
    root_ptr.additionalProperties = schema.JSONSchema{ .boolean = true };

    var ctx = MutCtx{};
    _ = try traverse.traverse(allocator, root, &ctx, countingMutation, .{});

    try std.testing.expectEqual(@as(usize, 2), ctx.call_count);
}

test "additionalProperties schema visits nested values" {
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();
    const allocator = arena.allocator();

    const root = try makeEmptyObject(allocator);
    const root_ptr = root.object;

    const child_c = try makeEmptyObject(allocator);
    const child_d = try makeEmptyObject(allocator);

    const additional = try makeEmptyObject(allocator);
    const additional_ptr = additional.object;
    additional_ptr.properties = try buildProperties(allocator, &[_]PropertyEntry{
        .{ .key = "c", .value = child_c },
        .{ .key = "d", .value = child_d },
    });

    root_ptr.additionalProperties = additional;

    var ctx = MutCtx{};
    _ = try traverse.traverse(allocator, root, &ctx, countingMutation, .{});

    try std.testing.expectEqual(@as(usize, 4), ctx.call_count);
}

test "cycle detection avoids infinite recursion" {
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();
    const allocator = arena.allocator();

    const root = try makeEmptyObject(allocator);
    const root_ptr = root.object;

    root_ptr.properties = try buildProperties(allocator, &[_]PropertyEntry{
        .{ .key = "self", .value = root },
    });

    var ctx = MutCtx{};
    _ = try traverse.traverse(allocator, root, &ctx, countingMutation, .{});

    try std.testing.expectEqual(@as(usize, 1), ctx.call_count);
}

test "skip_first_mutation skips root" {
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();
    const allocator = arena.allocator();

    const root = try makeEmptyObject(allocator);
    const root_ptr = root.object;
    const child = try makeEmptyObject(allocator);

    root_ptr.properties = try buildProperties(allocator, &[_]PropertyEntry{
        .{ .key = "child", .value = child },
    });

    var ctx = MutCtx{};
    _ = try traverse.traverse(allocator, root, &ctx, countingMutation, .{ .skip_first_mutation = true });

    try std.testing.expectEqual(@as(usize, 1), ctx.call_count);
}

test "skip_first_mutation skips boolean root" {
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();
    const allocator = arena.allocator();

    const root = schema.JSONSchema{ .boolean = true };

    var ctx = MutCtx{};
    _ = try traverse.traverse(allocator, root, &ctx, countingMutation, .{ .skip_first_mutation = true });

    try std.testing.expectEqual(@as(usize, 0), ctx.call_count);
}

test "mutable true preserves pointer" {
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();
    const allocator = arena.allocator();

    const root = try makeEmptyObject(allocator);
    const original_ptr = root.object;

    const result = try traverse.traverse(allocator, root, null, mutateMark, .{ .mutable = true });
    switch (result) {
        .object => |ptr| {
            try std.testing.expect(ptr == original_ptr);
            try std.testing.expect(ptr.multipleOf.? == 7.0);
        },
        .boolean => |_| {
            try std.testing.expect(false);
        },
    }
}

test "bfs traverses nodes breadth first" {
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();
    const allocator = arena.allocator();

    const root = try makeEmptyObject(allocator);
    const root_ptr = root.object;
    root_ptr.title = try allocator.dupe(u8, "root");

    const foo = try makeEmptyObject(allocator);
    const foo_ptr = foo.object;
    foo_ptr.title = try allocator.dupe(u8, "foo");

    const item0 = try makeEmptyObject(allocator);
    item0.object.title = try allocator.dupe(u8, "item0");
    const item1 = try makeEmptyObject(allocator);
    item1.object.title = try allocator.dupe(u8, "item1");

    const items_array = try allocator.alloc(schema.JSONSchema, 2);
    items_array[0] = item0;
    items_array[1] = item1;
    foo_ptr.items = schema.Items{ .schema_array = items_array };

    root_ptr.properties = try buildProperties(allocator, &[_]PropertyEntry{
        .{ .key = "foo", .value = foo },
    });

    var order_list = try std.ArrayList([]const u8).initCapacity(allocator, 0);
    defer order_list.deinit(allocator);
    var ctx = OrderCtx{ .order = &order_list };

    _ = try traverse.traverse(allocator, root, &ctx, recordOrder, .{ .bfs = true });

    const expected = [_][]const u8{ "root", "foo", "item0", "item1" };
    try std.testing.expectEqual(expected.len, order_list.items.len);

    var i: usize = 0;
    while (i < expected.len) : (i += 1) {
        try std.testing.expect(mem.eql(u8, expected[i], order_list.items[i]));
    }
}

fn countingMutation(ctx: ?*anyopaque, allocator: Allocator, current: schema.JSONSchema, _: bool) !schema.JSONSchema {
    _ = allocator;
    if (ctx) |raw| {
        const state: *MutCtx = @ptrCast(@alignCast(raw));
        state.call_count += 1;
    }
    return current;
}

fn mergeMutation(ctx: ?*anyopaque, allocator: Allocator, current: schema.JSONSchema, _: bool) !schema.JSONSchema {
    _ = ctx;
    switch (current) {
        .object => |ptr| {
            const clone_ptr = try allocator.create(schema.JSONSchemaObject);
            clone_ptr.* = ptr.*;

            var props = SchemaMap{};
            try props.map.put(allocator, "added", try makeEmptyObject(allocator));
            clone_ptr.properties = props;

            return schema.JSONSchema{ .object = clone_ptr };
        },
        .boolean => |value| return schema.JSONSchema{ .boolean = value },
    }
}

fn mutateMark(ctx: ?*anyopaque, allocator: Allocator, current: schema.JSONSchema, _: bool) !schema.JSONSchema {
    _ = ctx;
    _ = allocator;
    switch (current) {
        .object => |ptr| {
            ptr.multipleOf = 7.0;
            return current;
        },
        .boolean => |value| return schema.JSONSchema{ .boolean = value },
    }
}

fn recordOrder(ctx: ?*anyopaque, allocator: Allocator, current: schema.JSONSchema, _: bool) !schema.JSONSchema {
    if (ctx) |raw| {
        const state: *OrderCtx = @ptrCast(@alignCast(raw));
        const label = switch (current) {
            .boolean => |value| if (value) "true" else "false",
            .object => |ptr| ptr.title orelse "",
        };
        try state.order.append(allocator, label);
    }
    return current;
}

fn makeEmptyObject(allocator: Allocator) !schema.JSONSchema {
    const ptr = try allocator.create(schema.JSONSchemaObject);
    ptr.* = schema.JSONSchemaObject{};
    return schema.JSONSchema{ .object = ptr };
}

fn buildProperties(allocator: Allocator, kvs: []const PropertyEntry) !SchemaMap {
    var map = SchemaMap{};
    for (kvs) |entry| {
        try map.map.put(allocator, entry.key, entry.value);
    }
    return map;
}
