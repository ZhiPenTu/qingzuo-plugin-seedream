import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImagePayload, generateImage } from '../ui/seedream.mjs';

test('buildImagePayload validates prompt and configures generation parameters', () => {
  assert.throws(() => buildImagePayload({ prompt: '' }), /提示词/);
  assert.throws(() => buildImagePayload({ prompt: '   ' }), /提示词/);

  const t2i = buildImagePayload({
    prompt: '一幅水墨山水画',
    size: '2K',
    format: 'png'
  });
  assert.equal(t2i.model, 'doubao-seedream-5-0-pro');
  assert.equal(t2i.prompt, '一幅水墨山水画');
  assert.equal(t2i.size, '2K');
  assert.equal(t2i.output_format, 'png');
  assert.equal(t2i.watermark, false);
  assert.equal(t2i.image, undefined);

  const i2i = buildImagePayload({
    prompt: '将背景替换为赛博朋克夜景',
    imageBase64: 'iVBORw0KGgoAAAANSUhEUg==',
    imageMime: 'image/png',
    size: '1K',
    format: 'jpeg'
  });
  assert.equal(i2i.model, 'doubao-seedream-5-0-pro');
  assert.equal(i2i.prompt, '将背景替换为赛博朋克夜景');
  assert.equal(i2i.size, '1K');
  assert.equal(i2i.output_format, 'jpeg');
  assert.equal(i2i.image, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==');
});

test('generateImage calls Ark image endpoint and handles errors and responses', async () => {
  const payload = { model: 'doubao-seedream-5-0-pro', prompt: '测试' };

  // Success with b64_json
  const clientB64 = {
    network: {
      request: async (options) => {
        assert.equal(options.url, 'https://ark.cn-beijing.volces.com/api/v3/images/generations');
        assert.equal(options.method, 'POST');
        assert.equal(options.credential, 'volcengine-ark-key');
        assert.equal(options.credentialHeader, 'Authorization');
        return {
          status: 200,
          data: {
            data: [{ b64_json: 'BASE64DATA' }]
          }
        };
      }
    }
  };
  const resultB64 = await generateImage(clientB64, payload);
  assert.equal(resultB64.imageBase64, 'BASE64DATA');

  // Success with URL
  const clientUrl = {
    network: {
      request: async () => ({
        status: 200,
        data: { data: [{ url: 'https://example.com/image.png' }] }
      })
    }
  };
  const resultUrl = await generateImage(clientUrl, payload);
  assert.equal(resultUrl.imageUrl, 'https://example.com/image.png');

  // 401 error
  const client401 = { network: { request: async () => ({ status: 401 }) } };
  await assert.rejects(generateImage(client401, payload), /API 密钥无效/);

  // 402 error
  const client402 = { network: { request: async () => ({ status: 402 }) } };
  await assert.rejects(generateImage(client402, payload), /账户额度不足/);

  // 429 error
  const client429 = { network: { request: async () => ({ status: 429 }) } };
  await assert.rejects(generateImage(client429, payload), /过于频繁/);

  // Empty data array
  const clientEmpty = { network: { request: async () => ({ status: 200, data: { data: [] } }) } };
  await assert.rejects(generateImage(clientEmpty, payload), /未返回有效的生成图像/);
});
