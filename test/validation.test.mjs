import assert from "node:assert/strict";
import test from "node:test";
import {
  escapeCsvCell,
  isLoopbackHost,
  parseRepoList,
  resolveContainedPath,
  validateOwnerRepo,
} from "../src/validation.js";

test("validateOwnerRepo accepts valid names and blocks traversal", () => {
  assert.deepEqual(validateOwnerRepo("ameyachopade", "gitlytics"), ["ameyachopade", "gitlytics"]);
  assert.throws(() => validateOwnerRepo("../evil", "repo"));
  assert.throws(() => validateOwnerRepo("owner", ".."));
});

test("parseRepoList parses comma-separated lists", () => {
  assert.deepEqual(parseRepoList("a/b, c/d"), ["a/b", "c/d"]);
  assert.throws(() => parseRepoList("invalid-no-slash"));
});

test("resolveContainedPath blocks directory escape", () => {
  assert.throws(() => resolveContainedPath("/tmp/vault", "../../etc/passwd"));
});

test("escapeCsvCell neutralizes spreadsheet formulas and quotes commas", () => {
  assert.equal(escapeCsvCell("=SUM(A1:A2)"), "'=SUM(A1:A2)");
  assert.equal(escapeCsvCell("a,b"), '"a,b"');
  assert.equal(escapeCsvCell("plain"), "plain");
});

test("isLoopbackHost identifies loopback vs public binds", () => {
  assert.equal(isLoopbackHost("127.0.0.1"), true);
  assert.equal(isLoopbackHost("localhost"), true);
  assert.equal(isLoopbackHost("::1"), true);
  assert.equal(isLoopbackHost("0.0.0.0"), false);
});
