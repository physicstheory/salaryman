// Values that many shaders read: how dark it is, and a handful of shared uniforms.
import { uniform } from 'three/tsl';

export const nightU = uniform(1.0);        // 0 by day, 1 in the dark: the day/night cycle sets it
