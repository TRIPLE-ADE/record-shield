export function FormFieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-xs text-destructive">{message}</p> : null;
}
