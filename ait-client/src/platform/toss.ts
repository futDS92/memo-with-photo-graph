declare global {
  interface Window {
    getTossAppVersion?: () => string | number | undefined;
  }
}

export function getTossAppVersionSafe(): string | null {
  try {
    const value = window.getTossAppVersion?.();
    return value == null ? null : String(value);
  } catch {
    return null;
  }
}

export function isTossRuntime(): boolean {
  return Boolean(getTossAppVersionSafe());
}
