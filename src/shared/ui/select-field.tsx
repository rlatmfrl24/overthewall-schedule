import type { ComponentProps } from "react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"

type SelectFieldProps = Pick<ComponentProps<typeof SelectTrigger>, "id" | "aria-label" | "aria-labelledby" | "aria-describedby" | "aria-invalid" | "className" | "size" | "disabled"> & {
  value: string
  onValueChange: (value: string) => void
  options: readonly { value: string; label: string }[]
}

/** Flat options use the same primitive as rich selects, including empty filter values. */
function SelectField({ value, onValueChange, options, ...triggerProps }: SelectFieldProps) {
  return (
    <Select value={`value:${value}`} onValueChange={(next) => onValueChange(next.slice(6))} disabled={triggerProps.disabled}>
      <SelectTrigger {...triggerProps}><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={`value:${option.value}`}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export { SelectField }
