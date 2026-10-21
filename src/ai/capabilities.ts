/**
 * What this specific phone can actually do. Everything else in the app branches
 * on this, so the UI can always tell the learner the truth about what is running
 * locally versus what is unavailable.
 */
export interface Capabilities {
  webgpu: boolean;
  shaderF16: boolean;
  gpu: string;
  deviceMemoryGB: number | null;
  storageQuotaMB: number | null;
  cores: number;
  secureContext: boolean;
  /** Human-readable reasons WebGPU is unusable, for the settings screen. */
  blockers: string[];
}

interface NavigatorWithExtras extends Navigator {
  deviceMemory?: number;
}

export async function detectCapabilities(): Promise<Capabilities> {
  const nav = navigator as NavigatorWithExtras;
  const blockers: string[] = [];

  const caps: Capabilities = {
    webgpu: false,
    shaderF16: false,
    gpu: '',
    deviceMemoryGB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    storageQuotaMB: null,
    cores: nav.hardwareConcurrency || 1,
    secureContext: window.isSecureContext,
    blockers,
  };

  if (!window.isSecureContext) {
    blockers.push('Page is not a secure context. WebGPU and the microphone need https or localhost.');
  }

  if (!nav.gpu) {
    blockers.push('This browser does not expose WebGPU (navigator.gpu is missing).');
  } else if (!window.isSecureContext) {
    blockers.push('WebGPU is blocked outside a secure context.');
  } else {
    try {
      const adapter = await nav.gpu.requestAdapter();
      if (!adapter) {
        blockers.push('A GPU adapter was requested but the browser returned none.');
      } else {
        caps.webgpu = true;
        const features = adapter.features as { has(name: string): boolean };
        caps.shaderF16 = features.has('shader-f16');
        const info = (
          adapter as unknown as { info?: { vendor?: string; architecture?: string; description?: string } }
        ).info;
        caps.gpu = [info?.vendor, info?.architecture, info?.description].filter(Boolean).join(' ') || 'GPU adapter';
        if (!caps.shaderF16) {
          blockers.push(
            'No shader-f16 support: the faster 4-bit models are skipped automatically and a 32-bit variant is used.',
          );
        }
      }
    } catch (err) {
      blockers.push(`WebGPU adapter request failed: ${(err as Error).message}`);
    }
  }

  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota) caps.storageQuotaMB = Math.round(est.quota / 1e6);
  } catch {
    // storage.estimate is not available everywhere; the quota is only informational.
  }

  return caps;
}
