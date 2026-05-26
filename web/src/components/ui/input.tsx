import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, hint, error, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-text-primary"
          >
            {label}
          </label>
        )}
        <input
          type={type}
          id={inputId}
          className={cn(
            "flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2",
            "text-sm text-text-primary placeholder:text-text-muted",
            "transition-colors duration-200",
            "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:border-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-destructive focus:ring-destructive",
            className
          )}
          ref={ref}
          {...props}
        />
        {hint && !error && (
          <p className="text-xs text-text-muted">{hint}</p>
        )}
        {error && (
          <p className="text-xs text-destructive-700" role="alert">{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

// Password input with show/hide toggle
const PasswordInput = React.forwardRef<HTMLInputElement, InputProps>(
  (props, ref) => {
    const [show, setShow] = React.useState(false);
    return (
      <div className="relative">
        <Input
          {...props}
          type={show ? "text" : "password"}
          ref={ref}
          className={cn("pr-10", props.className)}
        />
        <button
          type="button"
          className="absolute right-3 top-8 text-text-muted hover:text-text-secondary transition-colors"
          onClick={() => setShow(!show)}
          aria-label={show ? "Hide password" : "Show password"}
          tabIndex={-1}
        >
          {show ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          )}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

function calcStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score: 1, label: "Weak", color: "bg-destructive" };
  if (score === 2) return { score: 2, label: "Fair", color: "bg-warning-500" };
  if (score === 3) return { score: 3, label: "Good", color: "bg-primary" };
  return { score: 4, label: "Strong", color: "bg-success-600" };
}

function PasswordStrengthMeter({ value }: { value: string }) {
  const { score, label, color } = calcStrength(value);
  if (!value) return null;
  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-200 ${score >= i ? color : "bg-border"}`}
          />
        ))}
      </div>
      <p className="text-xs text-text-muted">{label}</p>
    </div>
  );
}

// Number input — hides native spinners, shows a scrollable suggestions dropdown
interface NumberInputProps extends Omit<InputProps, "type"> {
  suggestions?: number[];
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ suggestions = [], label, hint, error, id, className, ...props }, ref) => {
    const [open, setOpen] = React.useState(false);
    const wrapperRef = React.useRef<HTMLDivElement>(null);
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    React.useEffect(() => {
      if (!open) return;
      const handler = (e: MouseEvent) => {
        if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const handleSelect = (value: number) => {
      const input = (ref as React.RefObject<HTMLInputElement>)?.current;
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, String(value));
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      setOpen(false);
    };

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-text-primary">
            {label}
          </label>
        )}
        <div ref={wrapperRef} className="relative">
          <input
            {...props}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            id={inputId}
            ref={ref}
            className={cn(
              "flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2",
              suggestions.length > 0 && "pr-8",
              "text-sm text-text-primary placeholder:text-text-muted",
              "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
              "transition-colors duration-200",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:border-primary",
              "disabled:cursor-not-allowed disabled:opacity-50",
              error && "border-destructive focus:ring-destructive",
              className
            )}
          />
          {suggestions.length > 0 && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setOpen((o) => !o)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          )}
          {open && (
            <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-border bg-surface shadow-md">
              {suggestions.map((v) => (
                <button
                  key={v}
                  type="button"
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-surface-muted text-text-primary"
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(v); }}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>
        {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
        {error && <p className="text-xs text-destructive-700" role="alert">{error}</p>}
      </div>
    );
  }
);
NumberInput.displayName = "NumberInput";

export { Input, PasswordInput, PasswordStrengthMeter, NumberInput };
