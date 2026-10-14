export function buildImagePayload({ prompt, imageBase64, imageMime = 'image/png', size = '2K', format = 'png' }) {
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('请输入图像设计提示词。');
  }
  const payload = {
    model: 'doubao-seedream-5-0-pro',
    prompt: prompt.trim(),
    size: size || '2K',
    output_format: format || 'png',
    watermark: false
  };
  if (imageBase64) {
    payload.image = `data:${imageMime};base64,${imageBase64}`;
  }
  return payload;
}

export async function generateImage(client, payload) {
  const response = await client.network.request({
    url: 'https://ark.cn-beijing.volces.com/api/v3/images/generations',
    method: 'POST',
    credential: 'volcengine-ark-key',
    credentialHeader: 'Authorization',
    json: payload,
    taskId: 'seedream-generate'
  });
  if (response.status === 401 || response.status === 403) throw new Error('火山方舟 API 密钥无效或未授权。');
  if (response.status === 402) throw new Error('火山方舟账户额度不足或未开通服务。');
  if (response.status === 429) throw new Error('服务请求过于频繁，请稍后手动重试。');
  if (response.status < 200 || response.status >= 300) throw new Error(`图像生成失败（${response.status}）。`);
  const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  const items = data?.data;
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('服务端未返回有效的生成图像。');
  }
  const item = items[0];
  const imageBase64 = item?.b64_json || null;
  const imageUrl = item?.url || null;
  if (!imageBase64 && !imageUrl) {
    throw new Error('未获取到图像数据或下载地址。');
  }
  return { imageBase64, imageUrl };
}
