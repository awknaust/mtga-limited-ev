/**
 * The worker entry: a backend behind comlink, and nothing else. `expose`
 * defaults its endpoint to `globalThis`, which keeps this file free of
 * `self` — tsconfig has no WebWorker lib to name it with.
 */

import { expose } from "comlink";

import { SimulationBackend } from "./backend";

expose(new SimulationBackend());
