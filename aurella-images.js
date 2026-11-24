/* Decode and cut photographs away from the interaction thread. Only one strip
   crosses back at a time; the original bitmap is released when the texture is ready. */
const photos = new Map();
onmessage = async ({ data: { id, action, key, url, y, height } }) => {
  try {
    if (action === 'open') {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Image ${response.status}`);
      const bitmap = await createImageBitmap(await response.blob(), { premultiplyAlpha: 'none' });
      photos.set(key, bitmap);
      postMessage({ id, width: bitmap.width, height: bitmap.height });
    } else if (action === 'strip') {
      const photo = photos.get(key);
      const bitmap = await createImageBitmap(photo, 0, y, photo.width, height, { premultiplyAlpha: 'none' });
      postMessage({ id, bitmap }, [bitmap]);
    } else if (action === 'close') {
      photos.get(key)?.close(); photos.delete(key); postMessage({ id });
    }
  } catch (error) { postMessage({ id, error: error.message }); }
};
