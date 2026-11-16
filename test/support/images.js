import sharp from 'sharp';

// A noisy image, so its JPEG is large and the WebP made from it is smaller.
export async function makeJpeg(width, height = width) {
  const pixels = Buffer.alloc(width * height * 3);

  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = (i * 7919) % 251;
  }

  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

export const imageSize = async (buffer) => {
  const { width, height, format } = await sharp(buffer).metadata();

  return { width, height, format };
};
