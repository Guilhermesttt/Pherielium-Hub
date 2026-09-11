(function attachOverlayGamepadController(global) {
  const BUTTONS = {
    0: "A",
    1: "B",
    2: "SQUARE",
    4: "L1",
    5: "R1",
    6: "L2",
    7: "R2",
    12: "UP",
    13: "DOWN",
    14: "LEFT",
    15: "RIGHT",
  };
  const DIRECTION_BY_BUTTON = {
    UP: "up",
    DOWN: "down",
    LEFT: "left",
    RIGHT: "right",
  };
  const DEADZONE = 0.35;
  const TRIGGER_THRESHOLD = 0.55;
  const AXIS_REPEAT_MS = 180;

  const buttonPressed = (button, threshold = 0.5) =>
    Boolean(button?.pressed || Number(button?.value || 0) > threshold);

  global.createOverlayGamepadController = ({
    getGamepads,
    requestFrame,
    cancelFrame,
    now,
    isPanelOpen,
    isSpotifyActive,
    actions,
  }) => {
    const previous = new Map();
    let frameHandle = 0;
    let running = false;
    let lastAxisMoveAt = 0;

    const dispatch = (name) => {
      if (name === "GUIDE") {
        actions.onGamepadInput?.();
        actions.togglePanel();
        return;
      }
      if (!isPanelOpen()) return;
      actions.onGamepadInput?.();
      if (DIRECTION_BY_BUTTON[name]) actions.moveFocus(DIRECTION_BY_BUTTON[name]);
      else if (name === "A") actions.activateFocus();
      else if (name === "B") actions.goBack();
      else if (name === "SQUARE") actions.deleteFocused?.();
      else if (name === "L1") actions.switchTab(-1);
      else if (name === "R1") actions.switchTab(1);
      else if (name === "L2" && isSpotifyActive?.()) actions.spotifyTrack?.(-1);
      else if (name === "R2" && isSpotifyActive?.()) actions.spotifyTrack?.(1);
    };

    const updateEdge = (key, pressed, action) => {
      const wasPressed = previous.get(key) === true;
      if (pressed && !wasPressed) action();
      previous.set(key, pressed);
    };

    const poll = () => {
      if (!running) return;
      const gamepad = Array.from(getGamepads?.() || []).find(Boolean);
      if (gamepad) {
        const guidePressed = buttonPressed(gamepad.buttons[16])
          || (buttonPressed(gamepad.buttons[8]) && buttonPressed(gamepad.buttons[9]));
        updateEdge(`${gamepad.index}:guide`, guidePressed, () => dispatch("GUIDE"));

        Object.entries(BUTTONS).forEach(([indexText, name]) => {
          const index = Number(indexText);
          const threshold = name === "L2" || name === "R2" ? TRIGGER_THRESHOLD : 0.5;
          const pressed = buttonPressed(gamepad.buttons[index], threshold);
          updateEdge(`${gamepad.index}:button:${index}`, pressed, () => dispatch(name));
        });

        if (isPanelOpen()) {
          const x = Number(gamepad.axes[0] || 0);
          const y = Number(gamepad.axes[1] || 0);
          const currentTime = now();
          if (currentTime - lastAxisMoveAt >= AXIS_REPEAT_MS) {
            let direction = null;
            if (Math.abs(x) > Math.abs(y) && Math.abs(x) > DEADZONE) direction = x < 0 ? "left" : "right";
            else if (Math.abs(y) > DEADZONE) direction = y < 0 ? "up" : "down";
            if (direction) {
              actions.onGamepadInput?.();
              actions.moveFocus(direction);
              lastAxisMoveAt = currentTime;
            }
          }
        }
      } else {
        previous.clear();
      }
      frameHandle = requestFrame(poll);
    };

    return {
      start() {
        if (running) return;
        running = true;
        frameHandle = requestFrame(poll);
      },
      stop() {
        running = false;
        if (frameHandle) cancelFrame(frameHandle);
        frameHandle = 0;
        previous.clear();
      },
      setOverlayFocus() {},
    };
  };
})(window);
