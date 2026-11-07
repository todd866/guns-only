import {courseFromGlb} from '../physics/district.mjs';

// District collision is parsed off the driving frame. The message is plain data;
// the caller rebuilds the collision world on the main thread.
self.onmessage = event => {
  const course = courseFromGlb(event.data);
  const {world, ...rest} = course;
  self.postMessage({
    ...rest,
    tris: world.tris.map(t => ({a: t.a, b: t.b, c: t.c, surface: t.surface}))
  });
};
