/**
 * input.js — Touch, keyboard, mouse, and pen input handling
 *
 * Architecture contract: Section 25, 26
 *
 * Exports a single setup function that returns a cleanup/dispose function.
 *
 * Features:
 * - Pointer Events for unified touch/mouse/pen
 * - Keyboard with remappable bindings
 * - Rush ignores keyboard auto-repeat (Section 26)
 * - Input buffering for jump and slide
 * - Cleanup function for resource disposal
 * - Enabled/disabled toggle
 * - Reduced motion awareness
 * - Prevents browser gestures only while enabled
 *
 * Required handler shape:
 *   {
 *     moveLeft:  () => void,
 *     moveRight: () => void,
 *     jump:      () => void,
 *     slide:     () => void,
 *     rush:      () => void,
 *     pause:     () => void
 *   }
 *
 * Required options shape:
 *   {
 *     enabled:       boolean | (() => boolean),
 *     reducedMotion:  boolean,
 *     keyBindings:   object | null
 *   }
 */

// ===== DEFAULT KEY BINDINGS =====

var DEFAULT_KEY_BINDINGS = {
  moveLeft:  ['ArrowLeft', 'a', 'A'],
  moveRight: ['ArrowRight', 'd', 'D'],
  jump:      ['ArrowUp', 'w', 'W'],
  slide:     ['ArrowDown', 's', 'S'],
  rush:      ['Shift', ' '],
  pause:     ['Escape']
};

// ===== INPUT BUFFER =====
// Buffers jump/slide inputs so they can be consumed on the next frame
// if the player presses slightly before landing or finishing a slide.

function createInputBuffer() {
  return {
    jump: false,
    slide: false,
    jumpAge: 0,
    slideAge: 0,
    maxAge: 150 // ms — buffer window
  };
}

function bufferInput(buffer, action) {
  if (action === 'jump') {
    buffer.jump = true;
    buffer.jumpAge = performance.now();
  } else if (action === 'slide') {
    buffer.slide = true;
    buffer.slideAge = performance.now();
  }
}

function consumeBuffer(buffer, action) {
  var now = performance.now();
  if (action === 'jump' && buffer.jump) {
    if (now - buffer.jumpAge < buffer.maxAge) {
      buffer.jump = false;
      return true;
    }
    buffer.jump = false;
  }
  if (action === 'slide' && buffer.slide) {
    if (now - buffer.slideAge < buffer.maxAge) {
      buffer.slide = false;
      return true;
    }
    buffer.slide = false;
  }
  return false;
}

function clearBuffer(buffer) {
  buffer.jump = false;
  buffer.slide = false;
}

// ===== SWIPE DETECTION =====

var SWIPE_THRESHOLD = 30; // px minimum distance to register a swipe
var DOUBLE_TAP_INTERVAL = 350; // ms

// ===== MAIN SETUP FUNCTION =====

/**
 * Set up all input handlers for the game.
 *
 * @param {HTMLElement} element - The element to attach pointer listeners to
 * @param {object} handlers - Callback object { moveLeft, moveRight, jump, slide, rush, pause }
 * @param {object} [options] - Configuration
 * @param {boolean|function} [options.enabled] - Whether input is active (can be a function)
 * @param {boolean} [options.reducedMotion] - If true, may adjust input sensitivity
 * @param {object} [options.keyBindings] - Custom key bindings override
 * @returns {function} Dispose function that removes all listeners
 */
export function setupInput(element, handlers, options) {
  if (!options) options = {};

  var keyBindings = options.keyBindings || DEFAULT_KEY_BINDINGS;
  var inputBuffer = createInputBuffer();

  // Build a reverse lookup: key string -> action name
  var keyActionMap = {};
  for (var action in keyBindings) {
    if (!Object.prototype.hasOwnProperty.call(keyBindings, action)) continue;
    var keys = keyBindings[action];
    if (!Array.isArray(keys)) keys = [keys];
    for (var ki = 0; ki < keys.length; ki++) {
      keyActionMap[keys[ki]] = action;
    }
  }

  // ===== ENABLED CHECK =====
  function isEnabled() {
    if (typeof options.enabled === 'function') return options.enabled();
    if (options.enabled === false) return false;
    return true;
  }

  // ===== POINTER (TOUCH / MOUSE / PEN) STATE =====
  var pointerStartX = 0;
  var pointerStartY = 0;
  var swiped = false;
  var lastTapTime = 0;
  var pointerDown = false;

  function onPointerDown(e) {
    if (!isEnabled()) return;
    // Only handle primary pointer (left mouse button or first touch)
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    pointerDown = true;
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    swiped = false;

    // Double-tap detection for rush
    var now = performance.now();
    if (now - lastTapTime < DOUBLE_TAP_INTERVAL) {
      if (handlers.rush) handlers.rush();
    }
    lastTapTime = now;

    // Capture pointer for reliable tracking
    try {
      element.setPointerCapture(e.pointerId);
    } catch (err) {
      // Some browsers may not support setPointerCapture on all elements
    }
  }

  function onPointerMove(e) {
    if (!isEnabled() || !pointerDown || swiped) return;

    var dx = e.clientX - pointerStartX;
    var dy = e.clientY - pointerStartY;

    // Vertical swipe takes priority if larger
    if (Math.abs(dy) > SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
      if (dy < -SWIPE_THRESHOLD) {
        // Swipe up -> jump
        if (handlers.jump) handlers.jump();
        bufferInput(inputBuffer, 'jump');
        swiped = true;
      } else if (dy > SWIPE_THRESHOLD) {
        // Swipe down -> slide
        if (handlers.slide) handlers.slide();
        bufferInput(inputBuffer, 'slide');
        swiped = true;
      }
    } else if (Math.abs(dx) > SWIPE_THRESHOLD) {
      // Horizontal swipe -> lane change
      if (dx > 0) {
        if (handlers.moveRight) handlers.moveRight();
      } else {
        if (handlers.moveLeft) handlers.moveLeft();
      }
      swiped = true;
    }
  }

  function onPointerUp(e) {
    pointerDown = false;
    try {
      element.releasePointerCapture(e.pointerId);
    } catch (err) {
      // Best-effort cleanup
    }
  }

  function onPointerCancel(e) {
    pointerDown = false;
  }

  // Prevent default touch actions only on the game element to avoid
  // interfering with scrolling on menu screens
  function onTouchStart(e) {
    if (isEnabled()) {
      e.preventDefault();
    }
  }

  function onTouchMove(e) {
    if (isEnabled()) {
      e.preventDefault();
    }
  }

  // ===== KEYBOARD =====

  function onKeyDown(e) {
    if (!isEnabled()) return;

    var action = keyActionMap[e.key];
    if (!action) return;

    // Rush: ignore keyboard auto-repeat (Section 26 requirement)
    if (action === 'rush' && e.repeat) return;

    switch (action) {
      case 'moveLeft':
        if (handlers.moveLeft) handlers.moveLeft();
        break;
      case 'moveRight':
        if (handlers.moveRight) handlers.moveRight();
        break;
      case 'jump':
        if (handlers.jump) handlers.jump();
        bufferInput(inputBuffer, 'jump');
        break;
      case 'slide':
        if (handlers.slide) handlers.slide();
        bufferInput(inputBuffer, 'slide');
        break;
      case 'rush':
        if (handlers.rush) handlers.rush();
        break;
      case 'pause':
        if (handlers.pause) handlers.pause();
        break;
    }
  }

  // ===== ATTACH LISTENERS =====

  // Pointer events on the game element
  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerCancel);

  // Touch event prevention (passive: false required for preventDefault)
  element.addEventListener('touchstart', onTouchStart, { passive: false });
  element.addEventListener('touchmove', onTouchMove, { passive: false });

  // Keyboard events on document (global, so they work regardless of focus)
  document.addEventListener('keydown', onKeyDown);

  // ===== INPUT BUFFER PUBLIC API =====
  // Exposed so the engine can check buffered inputs each frame

  /**
   * Check and consume a buffered input.
   * @param {string} action - 'jump' or 'slide'
   * @returns {boolean} Whether a buffered input was available
   */
  function consumeBufferedInput(action) {
    return consumeBuffer(inputBuffer, action);
  }

  /**
   * Clear all buffered inputs (e.g., on encounter resolve, death, etc.)
   */
  function clearBufferedInputs() {
    clearBuffer(inputBuffer);
  }

  // ===== DISPOSE / CLEANUP =====

  function dispose() {
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
    element.removeEventListener('pointercancel', onPointerCancel);
    element.removeEventListener('touchstart', onTouchStart);
    element.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('keydown', onKeyDown);
    clearBuffer(inputBuffer);
  }

  // Attach buffer utilities to the dispose function for engine access
  dispose.consumeBufferedInput = consumeBufferedInput;
  dispose.clearBufferedInputs = clearBufferedInputs;

  return dispose;
}
