const Util = {
  /**
   * Is the url compatible with the tabs.create API?
   * @param {string} url - The URL to check.
   * @returns {boolean} True if the URL is permissible, false otherwise.
   */
  isPermissibleURL(url) {
    const notPermissibleProtocols = new Set([
      "about:",
      "chrome:",
      "moz-extension:",
      "file:",
    ]);
    return !notPermissibleProtocols.has(new URL(url).protocol);
  },

  // UUIDv4 from https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
  generateUUID() {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
      (
        c ^
        (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
      ).toString(16),
    );
  },

  matchesQuery(subject, query) {
    return query
      .split(" ")
      .filter((token) => token)
      .every(
        (token) => subject.toLowerCase().indexOf(token.toLowerCase()) != -1,
      );
  },

  flattenArray(arr) {
    return arr.reduce((acc, cur) => acc.concat(cur), []);
  },

  /**
   * From https://gist.github.com/nmsdvid/8807205
   * Creates and returns a debounced version of the provided function.
   * The debounced function delays invoking `func` until after `wait` milliseconds
   * have elapsed since the last time it was invoked. Optionally, it can invoke
   * `func` immediately on the leading edge instead of the trailing.
   *
   * @param {Function} func - The function to debounce.
   * @param {number} wait - The number of milliseconds to delay.
   * @param {boolean} immediate - If true, trigger the function on the leading edge, instead of the trailing.
   * @returns {Function} - The debounced function.
   */
  debounce(func, wait, immediate) {
    var timeout;

    return () => {
      var context = this;
      var args = arguments;

      clearTimeout(timeout);
      timeout = setTimeout(() => {
        timeout = null;
        if (!immediate) {
          func.apply(context, args);
        }
      }, wait);

      if (immediate && !timeout) {
        func.apply(context, args);
      }
    };
  },
};
