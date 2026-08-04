import { uniformFloat64 } from "pure-rand/distribution/uniformFloat64";
import { xoroshiro128plus } from "pure-rand/generator/xoroshiro128plus";

/**
 * Seeded source of uniform values in [0, 1).
 *
 * xoroshiro128+ by way of pure-rand, which is TypeScript-native, zero
 * dependency and the generator fast-check relies on for reproducible runs —
 * preferable to hand-rolling a PRNG whose statistical properties nobody here
 * has any business vouching for.
 *
 * `uniformFloat64` draws 53 bits, so the returned values are multiples of
 * 2^-53 rather than the 32 bits a naive `x / 2^32` would give. The generator
 * advances in place, which is why this hands back a closure rather than the
 * generator itself.
 */
export function seededRandom(seed: number): () => number {
  const generator = xoroshiro128plus(seed);
  return () => uniformFloat64(generator);
}
