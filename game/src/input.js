// Keyboard and mouse input. Continuous flight axes are read as normalised values; discrete keys
// are forwarded to the app controller so menus and flight share one key map without conflicts.

const FLIGHT_KEYS = new Set([
  'KeyW',
  'KeyS',
  'KeyA',
  'KeyD',
  'KeyQ',
  'KeyE',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'KeyB',
]);

export class Input {
  constructor(target, callbacks = {}) {
    this.target = target;
    this.callbacks = callbacks;
    this.keys = new Set();
    this.dragging = false;
    this.lastPointer = { x: 0, y: 0 };
    this.wheelAccumulator = 0;
    this.enabled = true;
    this.bind();
  }

  bind() {
    window.addEventListener('keydown', (event) => {
      if (!this.enabled) return;
      if (FLIGHT_KEYS.has(event.code) && !event.repeat) this.keys.add(event.code);
      const consumed = this.callbacks.onKeyDown?.(event) === true;
      if (consumed) event.preventDefault();
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.dragging = false;
    });
    this.target.addEventListener('contextmenu', (event) => event.preventDefault());
    this.target.addEventListener('pointerdown', (event) => {
      if (!this.enabled) return;
      if (event.button !== 2) return;
      this.dragging = true;
      this.lastPointer.x = event.clientX;
      this.lastPointer.y = event.clientY;
      this.target.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    window.addEventListener('pointerup', (event) => {
      if (event.button === 2) this.dragging = false;
    });
    window.addEventListener('pointermove', (event) => {
      if (!this.dragging || !this.enabled) return;
      const dx = event.clientX - this.lastPointer.x;
      const dy = event.clientY - this.lastPointer.y;
      this.lastPointer.x = event.clientX;
      this.lastPointer.y = event.clientY;
      this.callbacks.onLook?.(dx, dy);
    });
    this.target.addEventListener(
      'wheel',
      (event) => {
        if (!this.enabled) return;
        event.preventDefault();
        const direction = Math.sign(event.deltaY);
        this.wheelAccumulator += direction;
        this.callbacks.onWheel?.(direction);
      },
      { passive: false },
    );
  }

  isDown(code) {
    return this.keys.has(code);
  }

  get pitch() {
    return (this.isDown('KeyW') ? 1 : 0) - (this.isDown('KeyS') ? 1 : 0);
  }

  get roll() {
    return (this.isDown('KeyD') ? 1 : 0) - (this.isDown('KeyA') ? 1 : 0);
  }

  get yaw() {
    return (this.isDown('KeyQ') ? 1 : 0) - (this.isDown('KeyE') ? 1 : 0);
  }

  get brakes() {
    return this.isDown('KeyB');
  }

  get throttleDelta() {
    return (this.isDown('ShiftLeft') || this.isDown('ShiftRight') ? 1 : 0) - (this.isDown('ControlLeft') || this.isDown('ControlRight') ? 1 : 0);
  }

  clear() {
    this.keys.clear();
    this.dragging = false;
  }
}
