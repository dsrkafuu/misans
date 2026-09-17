/*! DSRKafuU (https://dsrkafuu.net) | Copyright (c) Apache License 2.0 */
import subsetFont from 'subset-font';

/** name table ids preserved in subsets (license/version/family metadata) */
const PRESERVE_NAME_IDS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22,
];

self.onmessage = async (e) => {
  const { id, arrayBuffer, text } = e.data;
  try {
    const out = await subsetFont(Buffer.from(arrayBuffer), text, {
      targetFormat: 'woff2',
      preserveNameIds: PRESERVE_NAME_IDS,
    });
    // copy to an exact-size ArrayBuffer before transferring (Buffer pools must not be detached)
    const data = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    self.postMessage({ id, ok: true, data }, [data]);
  } catch (error) {
    self.postMessage({ id, ok: false, error: String((error && error.stack) || error) });
  }
};
