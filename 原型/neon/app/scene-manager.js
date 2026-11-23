// 场景切换器空壳：统一管理各场景注册、生命周期（onEnter/onExit/onUpdate/onRender/onPointer）和切换。

export function createSceneManager(sharedContext = {}) {
  const registry = new Map();
  let currentName = null;
  let currentScene = null;

  function register(name, factoryOrScene) {
    if (!name || typeof name !== 'string') {
      throw new TypeError('场景名必须是非空字符串');
    }
    if (!factoryOrScene || (typeof factoryOrScene !== 'function' && typeof factoryOrScene !== 'object')) {
      throw new TypeError(`场景 ${name} 必须是工厂函数或场景对象`);
    }
    registry.set(name, factoryOrScene);
  }

  function has(name) {
    return registry.has(name);
  }

  function list() {
    return Array.from(registry.keys());
  }

  function switchTo(name, payload = null) {
    if (!registry.has(name)) {
      throw new Error(`未注册的场景：${name}`);
    }
    if (currentScene && typeof currentScene.onExit === 'function') {
      currentScene.onExit();
    }

    const entry = registry.get(name);
    const context = {
      ...sharedContext,
      switchTo,
      hasScene: has,
      getCurrentSceneName: () => currentName,
    };
    const nextScene = typeof entry === 'function' ? entry(context) : entry;
    currentName = name;
    currentScene = nextScene;

    if (currentScene && typeof currentScene.onEnter === 'function') {
      currentScene.onEnter(payload, context);
    }
    return currentScene;
  }

  function update(dt, elapsed) {
    if (currentScene && typeof currentScene.onUpdate === 'function') {
      currentScene.onUpdate(dt, elapsed);
    }
  }

  function render(renderer) {
    if (currentScene && typeof currentScene.onRender === 'function') {
      currentScene.onRender(renderer);
    }
  }

  function dispatchPointer(event) {
    if (currentScene && typeof currentScene.onPointer === 'function') {
      return currentScene.onPointer(event);
    }
    return { cursor: 'default' };
  }

  return {
    register,
    has,
    list,
    switchTo,
    update,
    render,
    dispatchPointer,
    getCurrentName: () => currentName,
    getCurrentScene: () => currentScene,
  };
}
