import { GeminiImagenProvider } from './src/providers/image/imagen.ts';

async function run() {
  const provider = new GeminiImagenProvider();
  try {
    console.log('Generating image...');
    const result = await provider.generateImage('A test image of a cute cat', {});
    console.log('Success!', result.mimeType, 'Base64 length:', result.imageBase64?.length);
    console.log('First 50 chars of base64:', result.imageBase64?.substring(0, 50));
  } catch (err) {
    console.error('Error:', err);
  }
}
run();
