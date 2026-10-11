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

  /**
   * Turn what the user typed into a URL that tabs can be opened with.
   * @param {string} input - e.g. "https://example.com" or "example.com/page"
   * @returns {string} The URL. Throws if it's invalid or can't be opened by an extension.
   */
  normalizeURL(input) {
    let url = input.trim();
    // Add a protocol unless there is one ("localhost:3000" is a host and port, not a protocol)
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url) || /^[^:/]+:\d/.test(url)) {
      url = "https://" + url;
    }

    try {
      url = new URL(url).href;
    } catch (_error) {
      throw new Error(`Invalid URL: ${input}`);
    }
    // Firefox doesn't let extensions open about:, file:, javascript:, data: and other special URLs
    const protocol = new URL(url).protocol;
    if (protocol != "http:" && protocol != "https:") {
      throw new Error(`Only http and https URLs can be opened, not ${protocol}`);
    }
    return url;
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

  notify(message) {
    if (browser.notifications) {
      browser.notifications.create({
        type: "basic",
        iconUrl: browser.runtime.getURL("icons/container-site-d-48.png"),
        title: "Workspaces+",
        message: message,
      });
    }
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
