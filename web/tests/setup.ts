// web/tests/setup.ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// @testing-library/react's automatic afterEach cleanup only registers when it detects
// a global `afterEach` (i.e. `test.globals: true` in the vitest config). This project
// doesn't enable test globals, so without this explicit registration, DOM from one test
// in a file leaks into the next, causing "multiple elements found" failures in any test
// file with more than one render of the same component.
afterEach(() => {
  cleanup();
});
