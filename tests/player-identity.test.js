import { describe, expect, it } from "vitest";

import {
  createPlayerNameProvider,
  stripIdentityQueryParameters,
} from "../admin/player-link-names.js";
import { resolvePlayerDisplayName } from "../docs/player-experience.js";

describe("createPlayerNameProvider", () => {
  it("provides normalized names in assignment order", () => {
    const provider = createPlayerNameProvider([
      "  Anna   Beispiel ",
      "Ben Beispiel",
    ]);

    expect(provider()).toBe("Anna Beispiel");
    expect(provider()).toBe("Ben Beispiel");
    expect(() => provider()).toThrow(
      "No player name is available for the signed token.",
    );
  });
});

describe("stripIdentityQueryParameters", () => {
  it("removes unsigned identity metadata without changing the token", () => {
    const link = stripIdentityQueryParameters(
      "https://ptrcdx.github.io/ninepins/?player=Anna&source=admin#payload.signature",
    );
    const url = new URL(link);

    expect(url.searchParams.get("player")).toBeNull();
    expect(url.searchParams.get("source")).toBe("admin");
    expect(url.hash).toBe("#payload.signature");
  });
});

describe("resolvePlayerDisplayName", () => {
  it("reads the authenticated name from the verified session", () => {
    expect(
      resolvePlayerDisplayName(
        { playerName: "Claudia Beispiel" },
        "https://ptrcdx.github.io/ninepins/#token",
      ),
    ).toBe("Claudia Beispiel");
  });

  it("uses an explicit unavailable label for legacy tokens", () => {
    expect(
      resolvePlayerDisplayName(
        {},
        "https://ptrcdx.github.io/ninepins/#legacy-token",
        null,
      ),
    ).toBe("Name nicht verfügbar");
  });
});
