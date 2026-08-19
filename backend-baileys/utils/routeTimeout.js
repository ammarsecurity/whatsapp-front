/**
 * Reject if async handler does not finish within ms.
 * @template T
 * @param {number} ms
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function withRouteTimeout(ms, fn) {
  return Promise.race([
    fn(),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Request timed out after ${Math.round(ms / 1000)}s`));
      }, ms);
    }),
  ]);
}

module.exports = { withRouteTimeout };
