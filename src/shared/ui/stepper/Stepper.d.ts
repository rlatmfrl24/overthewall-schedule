import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export interface StepperProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children: ReactNode;
  initialStep?: number;
  /** One based. The caller commits navigation after validation and keeps the final step visible until saved. */
  currentStep?: number;
  /** Follow the OS, always reduce motion, or explicitly play the original React Bits motion. */
  reducedMotion?: 'user' | 'always' | 'never';
  onStepChange?: (step: number) => void;
  onFinalStepCompleted?: () => void;
  stepCircleContainerClassName?: string;
  stepContainerClassName?: string;
  contentClassName?: string;
  footerClassName?: string;
  backButtonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  nextButtonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  backButtonText?: ReactNode;
  nextButtonText?: ReactNode;
  completeButtonText?: ReactNode;
  footerContent?: ReactNode;
  stepLabels?: readonly string[];
  allowStepClick?: (step: number) => boolean;
  disableStepIndicators?: boolean;
  renderStepIndicator?: (props: { step: number; currentStep: number; onStepClick: (step: number) => void }) => ReactNode;
}

export default function Stepper(props: StepperProps): ReactNode;
export function Step(props: { children: ReactNode }): ReactNode;
