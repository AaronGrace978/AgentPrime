export interface ControlState {
  moveX: number;
  moveZ: number;
  jumpPressed: boolean;
  resetPressed: boolean;
}

export class Controls {
  private readonly keys = new Set<string>();
  private jumpQueued = false;
  private resetQueued = false;

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();

    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) {
        this.jumpQueued = true;
      }
      return;
    }

    if (key === 'r' && !event.repeat) {
      this.resetQueued = true;
    }

    this.keys.add(key);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    this.keys.delete(key);
  };

  constructor() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  public getState(): ControlState {
    const moveX =
      (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) -
      (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0);
    const moveZ =
      (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) -
      (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0);

    const state: ControlState = {
      moveX,
      moveZ,
      jumpPressed: this.jumpQueued,
      resetPressed: this.resetQueued,
    };

    this.jumpQueued = false;
    this.resetQueued = false;

    return state;
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.keys.clear();
  }
}
