import { vi } from 'vitest';

// jsdom does not implement IntersectionObserver; framer-motion's whileInView
// needs it at mount time. Provide a minimal no-op stub so motion tests pass.
class IntersectionObserverStub {
  observe = () => {};
  unobserve = () => {};
  disconnect = () => {};
  takeRecords = () => [];
  root = null;
  rootMargin = '';
  thresholds: number[] = [];
}

vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);
