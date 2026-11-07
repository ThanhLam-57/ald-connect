"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({ disabled, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button {...props} type="submit" disabled={disabled || pending} aria-busy={pending || undefined}>
      {children}
    </button>
  );
}
