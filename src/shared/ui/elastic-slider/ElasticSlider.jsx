// Adapted from https://reactbits.dev/r/ElasticSlider-JS-CSS.json.
// A native range preserves keyboard and assistive technology interaction.
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import React, { useRef, useState } from 'react';
import { RiVolumeDownFill, RiVolumeUpFill } from 'react-icons/ri';
import './ElasticSlider.css';

const MAX_OVERFLOW = 50;
const ACTIVE_SCALE = 1.2;

export default function ElasticSlider({
  id,
  defaultValue = 50,
  value: controlledValue,
  onValueChange,
  startingValue = 0,
  maxValue = 100,
  className = '',
  isStepped = false,
  stepSize = 1,
  leftIcon = <RiVolumeDownFill />,
  rightIcon = <RiVolumeUpFill />,
  onLeftIconClick,
  leftIconLabel,
  leftIconPressed,
  showValue = true,
  disabled = false,
  'aria-label': ariaLabel = 'Value',
  'aria-valuetext': ariaValueText,
  'aria-orientation': ariaOrientation = 'horizontal',
}) {
  const [localValue, setLocalValue] = useState(defaultValue);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const sliderRef = useRef(null);
  const inputRef = useRef(null);
  const activePointer = useRef(null);
  const overflow = useMotionValue(0);
  const scale = useMotionValue(1);
  const origin = useMotionValue('center');
  const [region, setRegion] = useState('middle');
  const upper = Math.max(startingValue, maxValue);
  const clamp = number => Math.min(upper, Math.max(startingValue, number));
  const value = clamp(controlledValue ?? localValue);
  const unavailable = disabled || upper === startingValue;
  const step = isStepped && stepSize > 0 ? stepSize : 'any';
  const percentage = upper === startingValue ? 0 : ((value - startingValue) / (upper - startingValue)) * 100;
  const scaleX = useTransform(overflow, latest => {
    const width = sliderRef.current?.getBoundingClientRect().width ?? 0;
    return width > 0 ? 1 + latest / width : 1;
  });
  const scaleY = useTransform(overflow, [0, MAX_OVERFLOW], [1, 0.8]);
  const height = useTransform(scale, [1, ACTIVE_SCALE], [6, 12]);
  const opacity = useTransform(scale, [1, ACTIVE_SCALE], [0.7, 1]);
  const margin = useTransform(scale, [1, ACTIVE_SCALE], [0, -3]);
  const leftX = useTransform(() => region === 'left' ? -overflow.get() / scale.get() : 0);
  const rightX = useTransform(() => region === 'right' ? overflow.get() / scale.get() : 0);

  const change = next => {
    if (unavailable) return;
    const snapped = step === 'any' ? next : startingValue + Math.round((next - startingValue) / step) * step;
    const result = clamp(snapped);
    setLocalValue(result);
    onValueChange?.(result);
  };
  const expand = active => {
    const target = active && !unavailable ? ACTIVE_SCALE : 1;
    animate(scale, target);
  };
  const move = event => {
    if (unavailable || activePointer.current !== event.pointerId) return;
    const bounds = sliderRef.current.getBoundingClientRect();
    if (bounds.width <= 0) return;
    change(startingValue + ((event.clientX - bounds.left) / bounds.width) * (upper - startingValue));
    const nextRegion = event.clientX < bounds.left ? 'left' : event.clientX > bounds.right ? 'right' : 'middle';
    setRegion(nextRegion);
    origin.set(nextRegion === 'left' ? 'right' : 'left');
    const distance = Math.max(bounds.left - event.clientX, event.clientX - bounds.right, 0);
    // Interrupt any old rebound while directly manipulating the track.
    overflow.jump(decay(distance, MAX_OVERFLOW));
  };
  const finish = event => {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    animate(overflow, 0, { type: 'spring', bounce: 0.5 });
    if (event.pointerType !== 'mouse') expand(false);
  };

  return (
    <div className={`elastic-slider ${className}`} data-disabled={unavailable || undefined}>
      <motion.div className="elastic-slider-wrapper"
        style={{ scale, opacity }}
        onHoverStart={() => expand(true)} onHoverEnd={() => expand(false)}>
        {leftIcon != null && <motion.span className="elastic-slider-icon"
          animate={{ scale: region === 'left' ? [1, 1.4, 1] : 1, transition: { duration: 0.25 } }}
          style={{ x: leftX }}>
          {onLeftIconClick ? <button type="button" className="elastic-slider-icon-button"
            aria-label={leftIconLabel} aria-pressed={leftIconPressed} disabled={disabled}
            onClick={onLeftIconClick}>{leftIcon}</button> : <span aria-hidden="true">{leftIcon}</span>}
        </motion.span>}
        <div ref={sliderRef} className="elastic-slider-root" data-keyboard-focus={keyboardFocus || undefined}
          onPointerDown={event => {
            if (unavailable || event.button !== 0 || activePointer.current !== null) return;
            event.preventDefault();
            inputRef.current.focus({ preventScroll: true });
            setKeyboardFocus(false);
            activePointer.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            expand(true);
            move(event);
          }}
          onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
          <motion.div className="elastic-slider-track-wrapper" aria-hidden="true"
            style={{ scaleX, scaleY, height, marginTop: margin, marginBottom: margin, transformOrigin: origin }}>
            <div className="elastic-slider-track">
              <div className="elastic-slider-range" style={{ width: `${percentage}%` }} />
            </div>
          </motion.div>
          <input ref={inputRef} id={id} className="elastic-slider-input" type="range"
            min={startingValue} max={upper} step={step} value={value} disabled={unavailable}
            aria-label={ariaLabel} aria-valuetext={ariaValueText} aria-orientation={ariaOrientation}
            onChange={event => change(Number(event.currentTarget.value))}
            onFocus={event => {
              setKeyboardFocus(event.currentTarget.matches(':focus-visible'));
              expand(true);
            }}
            onKeyDown={() => setKeyboardFocus(true)}
            onBlur={() => { setKeyboardFocus(false); expand(false); }} />
          {showValue && <output htmlFor={id} className="elastic-slider-value" aria-hidden="true">{Math.round(value)}</output>}
        </div>
        {rightIcon != null && <motion.span className="elastic-slider-icon" aria-hidden="true"
          animate={{ scale: region === 'right' ? [1, 1.4, 1] : 1, transition: { duration: 0.25 } }}
          style={{ x: rightX }}>{rightIcon}</motion.span>}
      </motion.div>
    </div>
  );
}

function decay(value, max) {
  return (2 / (1 + Math.exp(-value / max)) - 1) * max;
}
