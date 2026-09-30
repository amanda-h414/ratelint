# ratelint

A static linter for the bugs that show up in hand-rolled rate-limiting code.

Most rate limiters are written once, get a quick test with a curl loop, and
then sit untouched for years. The bugs in them tend to be small and easy to
miss in review: a `>` where you meant `>=`, a `Retry-After` value that goes
negative when the clock is a little off, a `Map` that quietly grows forever
because nothing ever calls `.delete` on it. None of these are the kind of
thing `tsc` or a general-purpose linter will ever flag, because they're not
type errors or style violations — they're domain-specific mistakes.

ratelint reads a file, checks it against a small set of rules, and prints
findings as `file:line: message [rule-id]`, the same shape as any other
linter output. It has no autofix. It just tells you where to look.

## Usage

```
npm run build
node dist/cli.js src/limiter.ts
```

Example output against a file with a couple of the bugs above:

```
src/limiter.ts:12: warning strict ">" comparison against a limit allows one extra request through before blocking; use ">=" [rate-limit-off-by-one]
src/limiter.ts:27: warning retryAfter is computed by subtraction with no clamp to zero; a stale reset time produces a negative wait [rate-limit-negative-retry-after]
```

Exit code is `1` if any file produced findings (or couldn't be read), `0`
otherwise, so it can be dropped into a CI step.

## Configuration

ratelint reads `ratelint.json` from the working directory if it exists, or
the file given with `--config <file>`. Each rule can be turned off or have
its severity changed:

```json
{
  "rules": {
    "rate-limit-zero-jitter": "off",
    "rate-limit-off-by-one": "error"
  }
}
```

Levels are `off`, `warning` and `error`. Unknown rule ids and invalid levels
are reported as errors (exit code 2) so a typo doesn't leave a rule
silently enabled.

## Rules

- **rate-limit-off-by-one** — `if (count > limit)` lets exactly one extra
  request through before the limiter starts blocking, because the request
  that pushes `count` to `limit` is still under the strict inequality. Use
  `>=`.
- **rate-limit-negative-retry-after** — a `retryAfter` value built by
  subtracting the current time from a stored reset timestamp
  (`resetAt - Date.now()`) goes negative the moment the reset time is in the
  past, which happens under clock drift or a slow request. Clients that
  trust a negative `Retry-After` will retry immediately instead of backing
  off. Clamp with `Math.max(0, ...)` or an equivalent ternary.
- **rate-limit-unbounded-store** — a `Map` named like a bucket, limiter, or
  counter store that the file never calls `.delete` on (and no
  `setInterval` sweep in sight) will hold on to an entry for every key
  (IP, token, user id) it has ever seen. `WeakMap` is exempt, since the GC
  can reclaim those entries on its own.
- **rate-limit-zero-jitter** — `Math.random() * n` used directly as a
  backoff delay can return a value close to zero, which occasionally
  produces an immediate retry and defeats the point of jitter. Add a
  minimum floor, e.g. `base + Math.random() * n`.

## How it works

Rules are line-based regex checks over the source text, not a full AST
parse — there's no TypeScript dependency, so there's nothing to install.
This keeps the tool small but means it can be fooled by unusual formatting
it hasn't been taught about (a limiter condition split across several
lines, for instance, won't be seen). Each rule strips string-literal
contents before matching, specifically so that a header name like
`'Retry-After'` doesn't get read as an arithmetic expression.

## Tests

`src/linter.test.ts` is a table of small source snippets, one rule and one
edge case per row, run with Node's built-in test runner:

```
npm run build
npm test
```

## License

MIT, see [LICENSE](LICENSE).
