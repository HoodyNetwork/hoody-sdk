'use strict';

// hub-names.js — HubNames: a suggested name for something new (a computer, a Bot). No DOM, no network.
//
// Contract:
//   - suggest(rand?) → "adjective-color-animal", lower case, letters and hyphens only, so it passes every
//     name rule the Hub creates things under (a computer's 3-100 [A-Za-z0-9_-], a Bot's name). Short enough
//     for a narrow field: at most MAX characters.
//   - rand(n) → an integer in [0, n). The default draws from crypto.getRandomValues with rejection sampling
//     (no modulo bias); a caller or a test passes its own. Without crypto.getRandomValues the page has no
//     secure source and suggest() returns '' (the field then simply has no suggestion): Math.random is not used.
//   - The word lists are plain, friendly English words (no brand names, no people, nothing a person could take
//     as an insult). English only on purpose: a name is an identifier, and the same words work in every locale.
(function () {
  var ADJECTIVES = ['agile', 'amber', 'bold', 'brave', 'bright', 'brisk', 'calm', 'clever', 'cosmic', 'crisp', 'daring', 'deft', 'eager', 'fancy', 'fast',
    'fresh', 'gentle', 'glad', 'golden', 'happy', 'jolly', 'keen', 'kind', 'lively', 'lucky', 'merry', 'mighty', 'nimble', 'noble', 'plucky', 'proud',
    'quick', 'quiet', 'rapid', 'sleek', 'smart', 'snappy', 'steady', 'sunny', 'swift', 'tidy', 'vivid', 'warm', 'witty', 'zesty', 'cheery', 'dandy', 'epic'];
  var COLORS = ['amber', 'azure', 'beige', 'black', 'blue', 'bronze', 'coral', 'cream', 'crimson', 'cyan', 'emerald', 'gold', 'green', 'grey', 'indigo',
    'ivory', 'jade', 'khaki', 'lemon', 'lilac', 'lime', 'maroon', 'mint', 'navy', 'olive', 'orange', 'peach', 'pink', 'plum', 'purple', 'red', 'rose',
    'ruby', 'rust', 'sage', 'sand', 'scarlet', 'silver', 'tan', 'teal', 'violet', 'white', 'yellow'];
  var ANIMALS = ['otter', 'falcon', 'badger', 'beaver', 'bison', 'camel', 'cheetah', 'cobra', 'condor', 'coyote', 'crane', 'dolphin', 'eagle', 'ferret',
    'finch', 'fox', 'gecko', 'gazelle', 'heron', 'hare', 'ibis', 'jaguar', 'koala', 'lemur', 'lynx', 'llama', 'marten', 'moose', 'narwhal', 'newt',
    'ocelot', 'orca', 'owl', 'panda', 'parrot', 'pelican', 'puffin', 'quail', 'raven', 'robin', 'seal', 'shrew', 'sparrow', 'squid', 'stork', 'swan',
    'tapir', 'tiger', 'toucan', 'turtle', 'walrus', 'weasel', 'whale', 'wombat', 'yak', 'zebra', 'alpaca', 'lark', 'magpie', 'marmot', 'osprey', 'wren'];
  var MAX = 40;
  var RULE = /^[a-z]+(?:-[a-z]+)*$/;

  function secure(n) {
    var c = window.crypto || window.msCrypto;
    if (!c || typeof c.getRandomValues !== 'function' || !(n >= 1) || n > 0x10000) return -1;
    // Rejection sampling over 32 bits: values at or above the largest multiple of n would favour small results.
    var limit = 0x100000000 - (0x100000000 % n), buf = new Uint32Array(1);
    for (var i = 0; i < 16; i++) {
      c.getRandomValues(buf);
      if (buf[0] < limit) return buf[0] % n;
    }
    return -1;
  }
  function pick(list, rand) {
    var i = rand(list.length);
    return typeof i === 'number' && i >= 0 && i < list.length && i % 1 === 0 ? list[i] : null;
  }
  function suggest(rand) {
    rand = typeof rand === 'function' ? rand : secure;
    for (var tries = 0; tries < 8; tries++) {
      var a = pick(ADJECTIVES, rand), c = pick(COLORS, rand), n = pick(ANIMALS, rand);
      if (a === null || c === null || n === null) return '';
      if (a === c) continue; // "amber-amber-fox" reads like a stutter
      var name = a + '-' + c + '-' + n;
      if (name.length <= MAX) return name;
    }
    return '';
  }

  window.HubNames = {
    suggest: suggest,
    valid: function (s) { return typeof s === 'string' && s.length >= 3 && s.length <= MAX && RULE.test(s); },
    MAX: MAX,
    words: { adjectives: ADJECTIVES.slice(), colors: COLORS.slice(), animals: ANIMALS.slice() },
  };
})();
