import type { ReactElement, ReactNode } from 'react';

export interface ElasticSliderProps {
  id?: string;
  defaultValue?: number;
  value?: number;
  onValueChange?: (value: number) => void;
  startingValue?: number;
  maxValue?: number;
  className?: string;
  isStepped?: boolean;
  stepSize?: number;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  onLeftIconClick?: () => void;
  leftIconLabel?: string;
  leftIconPressed?: boolean;
  showValue?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-valuetext'?: string;
  'aria-orientation'?: 'horizontal';
}

export default function ElasticSlider(props: ElasticSliderProps): ReactElement;
