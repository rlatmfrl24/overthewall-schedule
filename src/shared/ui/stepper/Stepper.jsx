import React, { useState, Children, useRef, useLayoutEffect } from 'react';
import { motion, AnimatePresence, MotionConfig, useIsPresent } from 'motion/react';

// React Bits Stepper-JS-CSS, installed from https://reactbits.dev/r/Stepper-JS-CSS.json.
// Extended for controlled, validated forms and content that resizes after loading.

import './Stepper.css';
import { useAnimations } from '../animation-provider';

export default function Stepper({
  children,
  initialStep = 1,
  currentStep: controlledStep,
  reducedMotion = 'user',
  onStepChange = () => {},
  onFinalStepCompleted = () => {},
  stepCircleContainerClassName = '',
  stepContainerClassName = '',
  contentClassName = '',
  footerClassName = '',
  backButtonProps = {},
  nextButtonProps = {},
  backButtonText = 'Back',
  nextButtonText = 'Continue',
  completeButtonText = 'Complete',
  stepLabels = [],
  allowStepClick = () => true,
  className = '',
  footerContent,
  disableStepIndicators = false,
  renderStepIndicator,
  ...rest
}) {
  const [internalStep, setCurrentStep] = useState(initialStep);
  const currentStep = controlledStep ?? internalStep;
  const { enabled } = useAnimations();
  const shouldReduceMotion = !enabled || reducedMotion === 'always';
  const [navigation, setNavigation] = useState({ step: currentStep, direction: 0 });
  let direction = navigation.direction;
  // Derive direction from committed steps, including async validation and summary edits.
  if (navigation.step !== currentStep) {
    direction = currentStep > navigation.step ? 1 : -1;
    setNavigation({ step: currentStep, direction });
  }
  const stepsArray = Children.toArray(children);
  const totalSteps = stepsArray.length;
  const isCompleted = currentStep > totalSteps;
  const isLastStep = currentStep === totalSteps;

  const updateStep = newStep => {
    // In controlled mode the caller advances only after validation / persistence.
    if (controlledStep === undefined) setCurrentStep(newStep);
    if (newStep > totalSteps) {
      onFinalStepCompleted();
    } else {
      onStepChange(newStep);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      updateStep(currentStep - 1);
    }
  };

  const handleNext = () => {
    if (!isLastStep) {
      updateStep(currentStep + 1);
    }
  };

  const handleComplete = () => {
    updateStep(totalSteps + 1);
  };

  return (
    <MotionConfig reducedMotion={shouldReduceMotion ? 'always' : 'never'}>
    <div className={`react-bits-stepper ${className}`} data-reduced-motion={Boolean(shouldReduceMotion)} {...rest}>
      <div
        className={`step-circle-container ${stepCircleContainerClassName}`}
      >
        <nav aria-label="제안 단계" className={`step-indicator-row ${stepContainerClassName}`}>
          {stepsArray.map((_, index) => {
            const stepNumber = index + 1;
            const isNotLastStep = index < totalSteps - 1;
            return (
              <React.Fragment key={stepNumber}>
                {renderStepIndicator ? (
                  renderStepIndicator({
                    step: stepNumber,
                    currentStep,
                    onStepClick: clicked => {
                      if (disableStepIndicators || !allowStepClick(clicked)) return;
                      updateStep(clicked);
                    }
                  })
                ) : (
                  <StepIndicator
                    step={stepNumber}
                    disableStepIndicators={disableStepIndicators || !allowStepClick(stepNumber)}
                    label={stepLabels[index]}
                    currentStep={currentStep}
                    onClickStep={clicked => {
                      updateStep(clicked);
                    }}
                  />
                )}
                {isNotLastStep && <StepConnector isComplete={currentStep > stepNumber} />}
              </React.Fragment>
            );
          })}
        </nav>

        <StepContentWrapper
          isCompleted={isCompleted}
          currentStep={currentStep}
          direction={direction}
          reducedMotion={shouldReduceMotion}
          className={`step-content-default ${contentClassName}`}
        >
          {stepsArray[currentStep - 1]}
        </StepContentWrapper>

        {!isCompleted && (
          <div className={`footer-container ${footerClassName}`}>
            {footerContent}
            <div className={`footer-nav ${currentStep !== 1 ? 'spread' : 'end'}`}>
              {currentStep !== 1 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className={`back-button ${currentStep === 1 ? 'inactive' : ''}`}
                  {...backButtonProps}
                >
                  {backButtonText}
                </button>
              )}
              <button type="button" onClick={isLastStep ? handleComplete : handleNext} className="next-button" {...nextButtonProps}>
                {isLastStep ? completeButtonText : nextButtonText}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </MotionConfig>
  );
}

function StepContentWrapper({ isCompleted, currentStep, direction, children, className, reducedMotion }) {
  const [parentHeight, setParentHeight] = useState(0);

  return (
    <motion.div
      className={className}
      initial={false}
      style={{ position: 'relative', overflow: 'hidden' }}
      animate={{ height: isCompleted ? 0 : parentHeight }}
      transition={reducedMotion ? { duration: 0 } : { type: 'spring', duration: 0.4 }}
    >
      <AnimatePresence initial={false} mode="sync" custom={direction}>
        {!isCompleted && (
          <SlideTransition key={currentStep} direction={direction} onHeightReady={setParentHeight} reducedMotion={reducedMotion}>
            {children}
          </SlideTransition>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SlideTransition({ children, direction, onHeightReady, reducedMotion }) {
  const containerRef = useRef(null);
  const isPresent = useIsPresent();

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element || !isPresent) return;
    const measure = () => onHeightReady(element.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children, isPresent, onHeightReady]);

  return (
    <motion.div
      ref={containerRef}
      inert={!isPresent}
      aria-hidden={!isPresent || undefined}
      custom={direction}
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: reducedMotion ? 0 : 0.4 }}
      style={{ position: 'absolute', left: 0, right: 0, top: 0 }}
    >
      {children}
    </motion.div>
  );
}

const stepVariants = {
  enter: dir => ({
    x: dir >= 0 ? '-100%' : '100%',
    opacity: 0
  }),
  center: {
    x: '0%',
    opacity: 1
  },
  exit: dir => ({
    x: dir >= 0 ? '50%' : '-50%',
    opacity: 0
  })
};

export function Step({ children }) {
  return <div className="step-default">{children}</div>;
}

function StepIndicator({ step, currentStep, onClickStep, disableStepIndicators, label }) {
  const { enabled } = useAnimations();
  const status = currentStep === step ? 'active' : currentStep < step ? 'inactive' : 'complete';

  const handleClick = () => {
    if (step !== currentStep && !disableStepIndicators) onClickStep(step);
  };

  return (
    <motion.button type="button" onClick={handleClick} className="step-indicator" disabled={disableStepIndicators} aria-label={`${step}. ${label ?? `Step ${step}`}`} aria-current={currentStep === step ? 'step' : undefined} data-status={status} animate={status} initial={false}>
      <motion.div
        variants={{
          inactive: { scale: 1 },
          active: { scale: 1.08 },
          complete: { scale: 1 }
        }}
        transition={{ duration: enabled ? 0.3 : 0 }}
        className="step-indicator-inner"
      >
        {status === 'complete' ? (
          <CheckIcon className="check-icon" />
        ) : status === 'active' ? (
          <div className="active-dot" />
        ) : (
          <span className="step-number">{step}</span>
        )}
      </motion.div>
      {label ? <span className="step-label">{label}</span> : null}
    </motion.button>
  );
}

function StepConnector({ isComplete }) {
  const { enabled } = useAnimations();
  const lineVariants = {
    incomplete: { width: 0 },
    complete: { width: '100%' }
  };

  return (
    <div className="step-connector" aria-hidden="true">
      <motion.div
        className="step-connector-inner"
        variants={lineVariants}
        initial={false}
        animate={isComplete ? 'complete' : 'incomplete'}
        transition={{ duration: enabled ? 0.4 : 0 }}
      />
    </div>
  );
}

function CheckIcon(props) {
  const { enabled } = useAnimations();
  return (
    <svg {...props} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <motion.path
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: enabled ? 0.1 : 0, type: 'tween', ease: 'easeOut', duration: enabled ? 0.3 : 0 }}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}
