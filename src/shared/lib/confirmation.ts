import { createContext, useContext, type ReactNode } from "react";

export interface ConfirmationOptions {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}
export type Confirm = (options: ConfirmationOptions) => Promise<boolean>;
export const ConfirmationContext = createContext<Confirm | null>(null);

export function useConfirmation(): Confirm {
  const confirm = useContext(ConfirmationContext);
  return confirm ?? (() => { throw new Error("Confirmation requires InteractionProvider."); });
}
