(() => {
  'use strict';

  const { Core } = globalThis.RedditToolbox;
  const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

  function secureInteger(maxExclusive, randomSource = globalThis.crypto) {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError('maxExclusive must be a positive integer.');
    }

    if (randomSource?.getRandomValues) {
      const ceiling = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
      const buffer = new Uint32Array(1);
      do {
        randomSource.getRandomValues(buffer);
      } while (buffer[0] >= ceiling);
      return buffer[0] % maxExclusive;
    }

    return Math.floor(Math.random() * maxExclusive);
  }

  function randomLetterString(length = 24, randomSource = globalThis.crypto) {
    const safeLength = Math.min(128, Math.max(8, Math.trunc(Number(length) || 24)));
    let value = '';
    for (let index = 0; index < safeLength; index += 1) {
      value += LETTERS[secureInteger(LETTERS.length, randomSource)];
    }
    return value;
  }

  function randomBetween(min, max, random = Math.random) {
    const low = Math.min(Number(min) || 0, Number(max) || 0);
    const high = Math.max(Number(min) || 0, Number(max) || 0);
    return Math.round(low + (high - low) * random());
  }

  Core.secureInteger = secureInteger;
  Core.randomLetterString = randomLetterString;
  Core.randomBetween = randomBetween;
})();
