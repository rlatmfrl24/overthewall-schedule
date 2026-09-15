// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Stepper, { Step } from './Stepper';

vi.mock('motion/react', async (importOriginal) => ({
  ...await importOriginal<typeof import('motion/react')>(),
  // Reproduce the reported OS setting; keep the real Motion components running.
  useReducedMotion: () => true,
}));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const contents = [<Step key="1">Video content</Step>, <Step key="2">Song content</Step>, <Step key="3">Singer content</Step>, <Step key="4">Review content</Step>];

describe('React Bits Stepper', () => {
  it('plays the original slide when explicitly enabled despite the OS preference, including external backward navigation', async () => {
    const { rerender } = render(<Stepper currentStep={1} reducedMotion="never">{contents}</Stepper>);
    rerender(<Stepper currentStep={3} reducedMotion="never">{contents}</Stepper>);
    const incoming = screen.getByText('Singer content').parentElement!;
    expect(incoming.style.transform).toBe('translateX(-100%)');
    await waitFor(() => expect(incoming.style.opacity).toBe('1'));
    rerender(<Stepper currentStep={2} reducedMotion="never">{contents}</Stepper>);
    const returning = screen.getByText('Song content').parentElement!;
    expect(returning.style.transform).toBe('translateX(100%)');
    await waitFor(() => expect(returning.style.opacity).toBe('1'));
  });

  it('supports the requested initialStep=3 configuration and completes an uncontrolled wizard', async () => {
    const changed = vi.fn();
    const completed = vi.fn();
    render(<Stepper initialStep={3} onStepChange={changed} onFinalStepCompleted={completed} backButtonText="Previous" nextButtonText="Next">{contents}</Stepper>);
    expect(screen.getByText('Singer content')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(changed).toHaveBeenLastCalledWith(4);
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));
    expect(completed).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByText('Review content')).toBeNull());
  });

  it('requests navigation without advancing controlled steps and preserves the final form until saved', () => {
    const changed = vi.fn();
    const completed = vi.fn();
    const { rerender } = render(<Stepper currentStep={1} onStepChange={changed} allowStepClick={step => step === 1}>{contents}</Stepper>);
    expect((screen.getByRole('button', { name: '3. Step 3' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(changed).toHaveBeenCalledWith(2);
    expect(screen.queryByText('Song content')).toBeNull();
    rerender(<Stepper currentStep={4} onFinalStepCompleted={completed} completeButtonText="검수 요청하기">{contents}</Stepper>);
    fireEvent.click(screen.getByRole('button', { name: '검수 요청하기' }));
    expect(completed).toHaveBeenCalledOnce();
    expect(screen.getByText('Review content')).toBeTruthy();
    expect(screen.getByRole('button', { name: '검수 요청하기' })).toBeTruthy();
  });
});
