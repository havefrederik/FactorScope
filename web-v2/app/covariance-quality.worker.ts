import { evaluateCovarianceForecasts, type QualityInput } from '../lib/covariance-quality.ts';

// Dedicated worker keeps the page usable; terminating it cancels the calculation.
const scope = self as unknown as { onmessage: ((event: MessageEvent<QualityInput>) => void) | null; postMessage: (message: unknown) => void };
scope.onmessage = event => {
  try { scope.postMessage({ type: 'result', result: evaluateCovarianceForecasts(event.data, (done, total) => scope.postMessage({ type: 'progress', done, total })) }); }
  catch (error) { scope.postMessage({ type: 'error', error: error instanceof Error ? error.message : 'Forecast evaluation failed.' }); }
};
