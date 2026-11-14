import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const notFoundMock = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const getServerSessionUserMock = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("@/features/auth/session", () => ({
  getServerSessionUser: getServerSessionUserMock,
}));

vi.mock("@/components/shell/app-shell", () => ({
  AppShell: () => null,
}));

vi.mock("@/components/shell/design-check-showcase", () => ({
  DesignCheckShowcase: () => null,
}));

describe("DesignCheckPage production guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSessionUserMock.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("calls notFound when VERCEL_ENV is production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "production");

    const { default: DesignCheckPage } = await import("./page");

    await expect(DesignCheckPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledTimes(1);
    expect(getServerSessionUserMock).not.toHaveBeenCalled();
  });

  it("calls notFound when NODE_ENV is production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");

    const { default: DesignCheckPage } = await import("./page");

    await expect(DesignCheckPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledTimes(1);
    expect(getServerSessionUserMock).not.toHaveBeenCalled();
  });

  it("renders normally in non-production environments", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");

    const { default: DesignCheckPage } = await import("./page");

    const result = await DesignCheckPage();
    expect(result).toBeTruthy();
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(getServerSessionUserMock).toHaveBeenCalledTimes(1);
  });
});
