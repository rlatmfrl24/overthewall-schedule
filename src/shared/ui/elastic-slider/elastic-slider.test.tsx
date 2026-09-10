// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ElasticSlider from './ElasticSlider';

beforeEach(() => {
  // jsdom does not implement PointerEvent or pointer capture.
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  vi.stubGlobal('PointerEvent', TestPointerEvent);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function track() {
  const input = screen.getByRole('slider') as HTMLInputElement;
  const root = input.parentElement!;
  Object.defineProperty(root, 'setPointerCapture', { value: vi.fn(), configurable: true });
  Object.defineProperty(root, 'hasPointerCapture', { value: () => false, configurable: true });
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
    x: 100, y: 0, left: 100, right: 300, top: 0, bottom: 24, width: 200, height: 24,
    toJSON: () => ({}),
  });
  return { input, root };
}

describe('ElasticSlider', () => {
  it('clears keyboard focus decoration when switching to pointer manipulation', () => {
    render(<ElasticSlider />);
    const { input, root } = track();
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(root.hasAttribute('data-keyboard-focus')).toBe(true);
    fireEvent.pointerDown(input, { pointerId: 1, button: 0, clientX: 200 });
    expect(document.activeElement).toBe(input);
    expect(root.hasAttribute('data-keyboard-focus')).toBe(false);
  });

  it('uses the React Bits zoom, edge deformation and spring rebound', async () => {
    render(<ElasticSlider />);
    const { input, root } = track();
    const visual = root.querySelector('.elastic-slider-track-wrapper') as HTMLElement;
    const wrapper = root.parentElement!;
    fireEvent.pointerDown(input, { pointerId: 1, button: 0, clientX: 200 });
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 350 });
    await waitFor(() => {
      expect(wrapper.style.transform).toBe('scale(1.2)');
      expect(visual.style.height).toBe('12px');
      const stretch = Number(visual.style.transform.match(/scaleX\(([^)]+)\)/)?.[1]);
      expect(stretch).toBeGreaterThan(1);
      expect(stretch).toBeGreaterThan(1.1);
    });
    fireEvent.pointerUp(root, { pointerId: 1 });
    // Release must start a spring, not immediately remove the deformation.
    expect(visual.style.transform).not.toBe('none');
    await waitFor(() => expect(visual.style.transform).toMatch(/scaleX\(0\./));
    await waitFor(() => {
      expect(visual.style.height).toBe('6px');
      expect(visual.style.transform).toBe('none');
    });
  });

  it('reflects playback updates without issuing a seek and forwards native input changes', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(<ElasticSlider value={65} maxValue={184} onValueChange={onValueChange} />);
    rerender(<ElasticSlider value={66} maxValue={184} onValueChange={onValueChange} />);
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('66');
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('slider'), { target: { value: '90' } });
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(90);
  });

  it('snaps relative to the minimum, clamps drags at both ends, and stops after release', () => {
    const onValueChange = vi.fn();
    render(<ElasticSlider startingValue={5} maxValue={105} defaultValue={55} isStepped stepSize={10} onValueChange={onValueChange} />);
    const { input, root } = track();
    fireEvent.pointerDown(input, { pointerId: 1, button: 0, clientX: 210 });
    expect(onValueChange).toHaveBeenLastCalledWith(65);
    expect(document.activeElement).toBe(input);
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 450 });
    expect(onValueChange).toHaveBeenLastCalledWith(105);
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 20 });
    expect(onValueChange).toHaveBeenLastCalledWith(5);
    fireEvent.pointerUp(root, { pointerId: 1 });
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 200 });
    expect(onValueChange).toHaveBeenCalledTimes(3);
  });

  it('ignores other pointers, secondary clicks and cancelled drags', () => {
    const onValueChange = vi.fn();
    render(<ElasticSlider onValueChange={onValueChange} />);
    const { root } = track();
    fireEvent.pointerDown(root, { button: 2, pointerId: 1, clientX: 200 });
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.pointerDown(root, { button: 0, pointerId: 1, clientX: 200 });
    fireEvent.pointerMove(root, { pointerId: 2, clientX: 250 });
    fireEvent.pointerCancel(root, { pointerId: 1 });
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 250 });
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(50);
  });

  it('disables unavailable playback and handles an empty range', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(<ElasticSlider disabled onValueChange={onValueChange} />);
    const { input, root } = track();
    expect(input.disabled).toBe(true);
    fireEvent.pointerDown(root, { pointerId: 1, button: 0, clientX: 200 });
    expect(onValueChange).not.toHaveBeenCalled();
    rerender(<ElasticSlider startingValue={0} maxValue={0} />);
    expect(input.disabled).toBe(true);
    expect(input.value).toBe('0');
  });
});
