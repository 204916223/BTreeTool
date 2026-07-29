import type { ShortcutAction } from "./messages";

export class ShortcutActionQueue {
  private ready = false;
  private readonly pendingActions: ShortcutAction[] = [];

  constructor(private readonly send: (action: ShortcutAction) => void) {}

  dispatch(action: ShortcutAction): void {
    if (!this.ready) {
      this.pendingActions.push(action);
      return;
    }

    this.send(action);
  }

  markReady(): void {
    if (this.ready) {
      return;
    }

    this.ready = true;
    this.pendingActions.splice(0).forEach(this.send);
  }
}
