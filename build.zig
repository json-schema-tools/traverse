const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const use_local_meta_schema = b.option(bool, "use-local-meta-schema", "Use local checkout of meta-schema instead of the package dependency") orelse false;

    var meta_schema_module: *std.Build.Module = undefined;
    if (use_local_meta_schema) {
        meta_schema_module = b.createModule(.{
            .root_source_file = .{ .cwd_relative = "../meta-schema/zig/schema.zig" },
            .target = target,
            .optimize = optimize,
        });
    } else {
        const meta_schema_dep = b.dependency("json_schema_tools_meta_schema", .{
            .target = target,
            .optimize = optimize,
        });
        meta_schema_module = b.createModule(.{
            .root_source_file = meta_schema_dep.path("zig/schema.zig"),
            .target = target,
            .optimize = optimize,
        });
    }

    const traverse_module = b.addModule("json_schema_tools_traverse", .{
        .root_source_file = .{ .cwd_relative = "zig/traverse.zig" },
        .target = target,
        .optimize = optimize,
    });
    traverse_module.addImport("json_schema_tools_meta_schema", meta_schema_module);

    const tests_module = b.createModule(.{
        .root_source_file = .{ .cwd_relative = "zig/traverse_test.zig" },
        .target = target,
        .optimize = optimize,
    });
    tests_module.addImport("json_schema_tools_traverse", traverse_module);
    tests_module.addImport("json_schema_tools_meta_schema", meta_schema_module);

    const unit_tests = b.addTest(.{ .root_module = tests_module });

    const test_step = b.step("test", "Run Zig unit tests");
    test_step.dependOn(&unit_tests.step);
}
