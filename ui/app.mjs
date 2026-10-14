import { createPluginClient } from './sdk.mjs';
import { buildImagePayload, generateImage } from './seedream.mjs';

const client = createPluginClient();
const bridge = globalThis.commercePlugin;
const $ = id => document.getElementById(id);

let selectedImageToken = null;
let selectedImageBase64 = null;
let currentImageToken = null;
let currentImageUrl = null;
let busy = false;

function message(text, type = '') {
  const el = $('status');
  el.textContent = text;
  el.className = type;
}

function updateControls() {
  $('key').disabled = busy;
  $('save-key').disabled = busy;
  $('clear-key').disabled = busy;
  $('mode').disabled = busy;
  $('pick-image').disabled = busy;
  $('clear-image').disabled = busy;
  $('prompt').disabled = busy;
  $('size').disabled = busy;
  $('format').disabled = busy;
  $('run').disabled = busy || !$('prompt').value.trim();
  $('cancel').disabled = !busy;
  $('save-image').disabled = busy || (!currentImageToken && !currentImageUrl);
}

async function refreshKeyStatus() {
  try {
    const hasKey = await client.credentials.status('volcengine-ark-key');
    $('key-status').textContent = hasKey
      ? '已配置火山方舟 API 密钥。生图调用费用由您的火山方舟账户扣除。'
      : '尚未配置 API 密钥，请先输入密钥并保存。';
  } catch (e) {
    $('key-status').textContent = '检查密钥状态失败：' + e.message;
  }
}

$('save-key').onclick = async () => {
  const val = $('key').value.trim();
  if (!val) {
    message('请输入有效的 API 密钥。', 'error');
    return;
  }
  try {
    await client.credentials.set('volcengine-ark-key', val);
    $('key').value = '';
    message('API 密钥已安全保存至系统凭据库。', 'success');
    await refreshKeyStatus();
  } catch (e) {
    message(e.message, 'error');
  }
};

$('clear-key').onclick = async () => {
  try {
    await client.credentials.clear('volcengine-ark-key');
    message('已清除保存的 API 密钥。', 'success');
    await refreshKeyStatus();
  } catch (e) {
    message(e.message, 'error');
  }
};

$('mode').onchange = () => {
  const isI2I = $('mode').value === 'i2i';
  $('image-group').hidden = !isI2I;
};

$('pick-image').onclick = async () => {
  try {
    const file = await client.files.pick({ extensions: ['png', 'jpg', 'jpeg', 'webp'] });
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      throw new Error('请选择小于 20 MB 的图片。');
    }
    if (selectedImageToken) {
      await client.files.release(selectedImageToken.token).catch(() => {});
    }
    selectedImageToken = file;
    const fileContent = await client.files.read(file.token);
    selectedImageBase64 = fileContent.data;

    const previewUrl = await client.files.url(file.token);
    $('ref-image-preview').src = previewUrl;
    $('ref-image-preview').hidden = false;
    $('clear-image').hidden = false;
    message(`已选择参考图片：${file.name}`);
  } catch (e) {
    message(e.message, 'error');
  }
};

$('clear-image').onclick = async () => {
  if (selectedImageToken) {
    await client.files.release(selectedImageToken.token).catch(() => {});
    selectedImageToken = null;
    selectedImageBase64 = null;
  }
  $('ref-image-preview').hidden = true;
  $('ref-image-preview').removeAttribute('src');
  $('clear-image').hidden = true;
  message('已移除参考图片。');
};

$('prompt').oninput = updateControls;

$('run').onclick = async () => {
  const prompt = $('prompt').value.trim();
  if (!prompt) {
    message('请输入图像设计提示词。', 'error');
    return;
  }
  const isI2I = $('mode').value === 'i2i';
  if (isI2I && !selectedImageBase64) {
    message('图生图模式下请先选择参考图片。', 'error');
    return;
  }

  busy = true;
  updateControls();
  message('正在调用 Seedream 5.0 Pro 模型生成图像…');

  $('image-result').hidden = true;
  $('image-result').removeAttribute('src');
  $('preview-placeholder').hidden = false;
  $('preview-placeholder').textContent = '正在生成图像，请稍候…';

  try {
    const format = $('format').value;
    const payload = buildImagePayload({
      prompt,
      imageBase64: isI2I ? selectedImageBase64 : null,
      imageMime: selectedImageToken ? selectedImageToken.mime : 'image/png',
      size: $('size').value,
      format
    });

    const result = await generateImage(client, payload);

    if (result.imageBase64) {
      if (currentImageToken) await client.files.release(currentImageToken.token).catch(() => {});
      currentImageToken = await client.files.create({
        data: result.imageBase64,
        filename: `seedream-${Date.now()}.${format}`,
        mime: format === 'png' ? 'image/png' : 'image/jpeg'
      });
      const imgSrc = await client.files.url(currentImageToken.token);
      $('image-result').src = imgSrc;
      $('image-result').hidden = false;
      $('preview-placeholder').hidden = true;
      currentImageUrl = null;
    } else if (result.imageUrl) {
      $('image-result').src = result.imageUrl;
      $('image-result').hidden = false;
      $('preview-placeholder').hidden = true;
      currentImageUrl = result.imageUrl;
    }

    message('图像生成完成！可以在线查看或保存。', 'success');
  } catch (error) {
    message(error.message, 'error');
    $('preview-placeholder').textContent = '生成未完成，请检查配置后重试。';
  } finally {
    busy = false;
    updateControls();
  }
};

$('cancel').onclick = async () => {
  message('正在取消操作…');
  try {
    if (bridge?.invoke) {
      await bridge.invoke('tasks.cancel', { id: 'seedream-generate' });
    }
    message('已取消生成。');
  } catch (e) {
    message(e.message, 'error');
  } finally {
    busy = false;
    updateControls();
  }
};

$('save-image').onclick = async () => {
  try {
    const ext = $('format').value || 'png';
    if (currentImageToken) {
      await client.files.save(currentImageToken.token, currentImageToken.name || `seedream-${Date.now()}.${ext}`);
      message('图片保存成功！', 'success');
    } else if (currentImageUrl) {
      const response = await client.network.request({
        url: currentImageUrl,
        method: 'GET',
        responseType: 'file',
        filename: `seedream-${Date.now()}.${ext}`
      });
      if (response.file) {
        await client.files.save(response.file.token, response.file.name);
        await client.files.release(response.file.token).catch(() => {});
        message('图片保存成功！', 'success');
      }
    }
  } catch (e) {
    message(e.message, 'error');
  }
};

client.onDispose(() => {
  $('image-result').removeAttribute('src');
  $('ref-image-preview').removeAttribute('src');
});

refreshKeyStatus();
updateControls();
