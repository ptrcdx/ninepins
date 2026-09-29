import { describe, expect, it } from "vitest";

import { buildNamedPlayerLink } from "../admin/player-link-names.js";
import { resolvePlayerDisplayName } from "../docs/player-experience.js";

describe("buildNamedPlayerLink", () => {
  it("adds the encoded player name before the signed fragment", () => {
    const link = buildNamedPlayerLink(
      "https://ptrcdx.github.io/ninepins/#payload.signature",
      "Claudia Beispiel",
    );

    const url = new URL(link);
    expect(url.searchParams.get("player")).toBe("Claudia Beispiel");
    expect(url.hash).toBe("#payload.signature");
  });

  it("preserves existing query parameters", () => {
    const link = buildNamedPlayerLink(
      "https://ptrcdx.github.io/ninepins/?source=admin#payload.signature",
      "Anna & Ben",
    );

    const url = new URL(link);
    expect(url.searchParams.get("source")).toBe("admin");
    expect(url.searchParams.get("player")).toBe("Anna & Ben");
  });
});

describe("resolvePlayerDisplayName", () => {
  it("prefers the personal link name", () => {
    expect(
      resolvePlayerDisplayName(
        { displayName: "Session Name" },
        "https://ptrcdx.github.io/ninepins/?player=Claudia%20Beispiel#token",
      ),
    ).toBe("Claudia Beispiel");
  });

  it("falls back to a session display name", () => {
    expect(
      resolvePlayerDisplayName(
        { player: { displayName: "Carla K." } },
        "https://ptrcdx.github.io/ninepins/#token",
      ),
    ).toBe("Carla K.");
  });

  it("uses a neutral fallback when no name exists", () => {
    expect(
      resolvePlayerDisplayName({}, "https://ptrcdx.github.io/ninepins/#token"),
    ).toBe("Gastspielerin");
  });
});
