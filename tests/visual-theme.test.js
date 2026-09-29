import { describe, expect, it } from "vitest";

import {
  installPumperellaVisualThemeHooks,
  resolvePremiumCameraProfile,
} from "../docs/visual-theme.js";

function createFakeThree() {
  class FakeScene {
    constructor() {
      this.isScene = true;
      this.userData = {};
      this.children = [];
    }

    add(...objects) {
      this.children.push(...objects);
      return this;
    }
  }

  class FakePerspectiveCamera {
    constructor() {
      this.isPerspectiveCamera = true;
      this.fov = 70;
      this.position = {
        value: null,
        set: (...value) => {
          this.position.value = value;
        },
      };
      this.lookAtValue = null;
      this.projectionUpdates = 0;
    }

    lookAt(...value) {
      this.lookAtValue = value;
    }

    updateMatrixWorld() {}

    updateProjectionMatrix() {
      this.projectionUpdates += 1;
    }
  }

  return {
    three: {
      Scene: FakeScene,
      PerspectiveCamera: FakePerspectiveCamera,
    },
    Scene: FakeScene,
    PerspectiveCamera: FakePerspectiveCamera,
  };
}

describe("resolvePremiumCameraProfile", () => {
  it("uses the premium desktop landscape framing", () => {
    expect(resolvePremiumCameraProfile(1920, 1080)).toEqual({
      fov: 42,
      position: [0, 5.15, 11.35],
      target: [0, 0.44, -6.45],
    });
  });

  it("keeps compact landscape browser chrome in view", () => {
    expect(resolvePremiumCameraProfile(844, 390)).toEqual({
      fov: 43,
      position: [0, 5.05, 11.55],
      target: [0, 0.42, -6.55],
    });
  });

  it("uses a wider portrait framing on mobile", () => {
    expect(resolvePremiumCameraProfile(390, 844)).toEqual({
      fov: 52,
      position: [0, 5.35, 10.9],
      target: [0, 0.36, -6.25],
    });
  });
});

describe("installPumperellaVisualThemeHooks", () => {
  it("decorates the concrete scene after synchronous construction", () => {
    const { three, Scene } = createFakeThree();
    const tasks = [];
    const decoratedScenes = [];

    installPumperellaVisualThemeHooks(three, {
      schedule(task) {
        tasks.push(task);
      },
      decorate(scene) {
        scene.userData.pumperellaPremiumSceneV2 = true;
        decoratedScenes.push(scene);
      },
      viewport() {
        return { width: 1920, height: 1080 };
      },
    });

    const scene = new Scene();
    scene.add({ name: "lane" });
    scene.add({ name: "pins" });

    expect(tasks).toHaveLength(1);
    expect(decoratedScenes).toHaveLength(0);

    tasks[0]();

    expect(decoratedScenes).toEqual([scene]);
    scene.add({ name: "late-object" });
    expect(tasks).toHaveLength(1);
  });

  it("overrides default camera values before projection updates", () => {
    const { three, PerspectiveCamera } = createFakeThree();

    installPumperellaVisualThemeHooks(three, {
      schedule() {},
      decorate() {},
      viewport() {
        return { width: 1920, height: 1080 };
      },
    });

    const camera = new PerspectiveCamera();
    camera.updateProjectionMatrix();

    expect(camera.fov).toBe(42);
    expect(camera.position.value).toEqual([0, 5.15, 11.35]);
    expect(camera.lookAtValue).toEqual([0, 0.44, -6.45]);
    expect(camera.projectionUpdates).toBe(1);
  });
});
