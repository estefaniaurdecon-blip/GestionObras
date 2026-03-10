import { describe, expect, it } from "vitest";

import { buildTenantHeaders } from "../api/client";

describe("buildTenantHeaders", () => {
  it("omite la cabecera cuando no hay tenant", () => {
    expect(buildTenantHeaders()).toEqual({});
    expect(buildTenantHeaders(null)).toEqual({});
    expect(buildTenantHeaders("")).toEqual({});
  });

  it("normaliza la cabecera de tenant cuando hay valor", () => {
    expect(buildTenantHeaders(42)).toEqual({ "X-Tenant-Id": "42" });
    expect(buildTenantHeaders("  17 ")).toEqual({ "X-Tenant-Id": "17" });
  });
});
