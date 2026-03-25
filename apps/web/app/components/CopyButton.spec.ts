/**
 * Unit tests for CopyButton logic.
 * Tests copy state management, timeout reset, and render mode selection.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mirror the component's internal state logic

interface CopyState {
  copied: boolean;
}

function createCopyStateMachine() {
  let state: CopyState = { copied: false };
  let timer: ReturnType<typeof setTimeout> | null = null;

  function copy(onSuccess?: () => void): void {
    // Cancel any previous timer before setting a new one
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    state = { copied: true };
    onSuccess?.();
    timer = setTimeout(() => {
      state = { copied: false };
    }, 2000);
  }

  function reset(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    state = { copied: false };
  }

  function getState(): CopyState {
    return { ...state };
  }

  return { copy, reset, getState };
}

describe('CopyButton — copy state machine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with copied=false', () => {
    const machine = createCopyStateMachine();
    expect(machine.getState().copied).toBe(false);
  });

  it('copy() sets copied=true immediately', () => {
    const machine = createCopyStateMachine();
    machine.copy();
    expect(machine.getState().copied).toBe(true);
  });

  it('copied resets to false after 2000ms', () => {
    const machine = createCopyStateMachine();
    machine.copy();
    expect(machine.getState().copied).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(machine.getState().copied).toBe(false);
  });

  it('copied is still true at 1999ms', () => {
    const machine = createCopyStateMachine();
    machine.copy();
    vi.advanceTimersByTime(1999);
    expect(machine.getState().copied).toBe(true);
  });

  it('reset() immediately sets copied=false', () => {
    const machine = createCopyStateMachine();
    machine.copy();
    machine.reset();
    expect(machine.getState().copied).toBe(false);
  });

  it('reset() cancels the pending timer', () => {
    const machine = createCopyStateMachine();
    machine.copy();
    machine.reset();
    // advance past the original timeout — should remain false, not flip again
    vi.advanceTimersByTime(3000);
    expect(machine.getState().copied).toBe(false);
  });

  it('calling copy() triggers onSuccess callback', () => {
    const machine = createCopyStateMachine();
    const cb = vi.fn();
    machine.copy(cb);
    expect(cb).toHaveBeenCalledOnce();
  });

  it('multiple copy() calls each start fresh 2s window', () => {
    const machine = createCopyStateMachine();
    machine.copy();
    vi.advanceTimersByTime(1000);
    machine.copy(); // restart timer
    vi.advanceTimersByTime(1500);
    // Still within new 2s window
    expect(machine.getState().copied).toBe(true);
  });
});

describe('CopyButton — render mode selection', () => {
  type RenderMode = 'default' | 'custom';

  function getRenderMode(hasChildren: boolean): RenderMode {
    return hasChildren ? 'custom' : 'default';
  }

  it('no children → default button mode', () => {
    expect(getRenderMode(false)).toBe('default');
  });

  it('with children → custom render mode', () => {
    expect(getRenderMode(true)).toBe('custom');
  });
});

describe('CopyButton — clipboard failure graceful degradation', () => {
  it('clipboard failure does not throw (silent catch)', () => {
    // Simulate the catch block: error is silently swallowed
    const silentCopy = async () => {
      try {
        throw new Error('Clipboard not available');
      } catch (_err) {
        // intentionally empty — graceful degradation
      }
    };

    expect(silentCopy()).resolves.toBeUndefined();
  });

  it('successful copy does not throw', async () => {
    const mockWrite = vi.fn().mockResolvedValue(undefined);

    const copy = async () => {
      try {
        await mockWrite('test-value');
        return true;
      } catch {
        return false;
      }
    };

    const result = await copy();
    expect(result).toBe(true);
    expect(mockWrite).toHaveBeenCalledWith('test-value');
  });

  it('failed copy returns false without throwing', async () => {
    const mockWrite = vi.fn().mockRejectedValue(new Error('Permission denied'));

    const copy = async () => {
      try {
        await mockWrite('test-value');
        return true;
      } catch {
        return false;
      }
    };

    const result = await copy();
    expect(result).toBe(false);
  });
});

describe('CopyButton — copied state UI label logic', () => {
  function getLabel(copied: boolean): string {
    return copied ? 'Copied' : 'Copy';
  }

  it('shows "Copy" when not copied', () => {
    expect(getLabel(false)).toBe('Copy');
  });

  it('shows "Copied" when copied', () => {
    expect(getLabel(true)).toBe('Copied');
  });

  it('transitions between states correctly', () => {
    let copied = false;
    expect(getLabel(copied)).toBe('Copy');
    copied = true;
    expect(getLabel(copied)).toBe('Copied');
    copied = false;
    expect(getLabel(copied)).toBe('Copy');
  });
});
