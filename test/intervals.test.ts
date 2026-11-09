import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { mergeIntervals, type Interval } from '../src/intervals';

// Order the endpoints to construct valid intervals, including single points.
// A small range makes overlaps, duplicates, and shared endpoints common.
const endpoint = fc.integer({ min: -20, max: 20 });
const interval: fc.Arbitrary<Interval> = fc.tuple(endpoint, endpoint)
  .map(([a, b]) => [Math.min(a, b), Math.max(a, b)]);
const intervalList = fc.array(interval, { maxLength: 12 });

// Positive gaps construct intervals that neither overlap nor touch.
const disjointIntervals = fc.tuple(
  endpoint,
  fc.array(fc.tuple(fc.nat(5), fc.integer({ min: 1, max: 5 })), { maxLength: 12 }),
).map(([start, lengthsAndGaps]) => {
  const intervals: Interval[] = [];
  for (const [length, gap] of lengthsAndGaps) {
    const end = start + length;
    intervals.push([start, end]);
    start = end + gap;
  }
  return intervals;
});

const covers = (intervals: Interval[], point: number) =>
  intervals.some(([start, end]) => start <= point && point <= end);

const copyIntervals = (intervals: Interval[]): Interval[] =>
  intervals.map(([start, end]) => [start, end]);

describe('mergeIntervals', () => {
  // Pattern: invariant. Every input interval lies inside some output interval.
  it('every input interval lies inside some output interval', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const original = copyIntervals(xs);
        const out = mergeIntervals(xs);
        for (const [start, end] of original) {
          expect(out.some(([a, b]) => a <= start && end <= b)).toBe(true);
        }
      }),
    );
  });

  // Pattern: invariant. The output is valid, sorted, and has no overlaps or touching intervals.
  it('returns valid intervals separated by strict gaps', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        for (let i = 0; i < out.length; i++) {
          const [start, end] = out[i];
          expect(Number.isInteger(start)).toBe(true);
          expect(Number.isInteger(end)).toBe(true);
          expect(start).toBeLessThanOrEqual(end);
          if (i > 0) expect(out[i - 1][1]).toBeLessThan(start);
        }
      }),
    );
  });

  // Pattern: invariant. Neither the input array nor its interval endpoints change.
  it('does not modify the input', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const original = copyIntervals(xs);
        mergeIntervals(xs);
        expect(xs).toEqual(original);
      }),
    );
  });

  // Pattern: differential. A simple point-coverage check agrees on the input and output.
  it('preserves exactly the covered points, including fractional points', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const original = copyIntervals(xs);
        const out = mergeIntervals(xs);
        const endpoints = [...new Set([...original, ...out].flat())].sort((a, b) => a - b);
        // Coverage can change only at an endpoint. Check every endpoint,
        // a midpoint in every gap, and points outside the full range.
        const points = [...endpoints];
        for (let i = 1; i < endpoints.length; i++) {
          points.push((endpoints[i - 1] + endpoints[i]) / 2);
        }
        if (endpoints.length > 0) {
          points.push(endpoints[0] - 1, endpoints[endpoints.length - 1] + 1);
        }
        for (const point of points) {
          expect(covers(out, point)).toBe(covers(original, point));
        }
      }),
    );
  });

  // Pattern: metamorphic. Reordering or duplicating the input does not change its union.
  it('is unchanged by reversing or duplicating the input', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const expected = mergeIntervals(copyIntervals(xs));
        expect(mergeIntervals(copyIntervals(xs).reverse())).toEqual(expected);
        expect(mergeIntervals([...copyIntervals(xs), ...copyIntervals(xs)])).toEqual(expected);
      }),
    );
  });

  // Pattern: algebraic. Merging an already merged result is idempotent.
  it('is idempotent', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const merged = mergeIntervals(xs);
        expect(mergeIntervals(copyIntervals(merged))).toEqual(merged);
      }),
    );
  });

  // Pattern: conditional. Disjoint, non-touching intervals are returned unchanged except for order.
  it('only sorts intervals that already have strict gaps', () => {
    fc.assert(
      fc.property(disjointIntervals, sorted => {
        expect(mergeIntervals(copyIntervals(sorted).reverse())).toEqual(sorted);
      }),
    );
  });
});
