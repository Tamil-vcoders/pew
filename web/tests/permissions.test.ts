// web/tests/permissions.test.ts
import { describe, expect, it } from "vitest";
import { capabilitiesFor, requiresRoleCaption, ROLE_LEVEL } from "../shared/rbac/permissions";

describe("ROLE_LEVEL", () => {
  it("matches the API's ordering exactly", () => {
    expect(ROLE_LEVEL).toEqual({ viewer: 0, contributor: 1, maintainer: 2, administrator: 3 });
  });
});

describe("capabilitiesFor", () => {
  it("gives a viewer no edit/settings/admin capability", () => {
    expect(capabilitiesFor("viewer")).toEqual({ edit: false, settings: false, admin: false });
  });
  it("gives a contributor edit only", () => {
    expect(capabilitiesFor("contributor")).toEqual({ edit: true, settings: false, admin: false });
  });
  it("gives a maintainer edit and settings", () => {
    expect(capabilitiesFor("maintainer")).toEqual({ edit: true, settings: true, admin: false });
  });
  it("gives an administrator everything", () => {
    expect(capabilitiesFor("administrator")).toEqual({ edit: true, settings: true, admin: true });
  });
  it("gives a signed-out (null) user nothing", () => {
    expect(capabilitiesFor(null)).toEqual({ edit: false, settings: false, admin: false });
  });
});

describe("requiresRoleCaption", () => {
  it("renders the prototype's disabled-control caption format", () => {
    expect(requiresRoleCaption("contributor")).toBe("Requires contributor role");
    expect(requiresRoleCaption("maintainer")).toBe("Requires maintainer role");
  });
});
