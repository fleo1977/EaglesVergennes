// Resize uploads before sending them to stay within hosted function request limits.
window.prepareUploadImage = async file => {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG or WebP picture.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose a picture under 5 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const result = canvas.toDataURL('image/jpeg', .85);
    if (result.length > 4 * 1024 * 1024) throw new Error('This picture is too large. Choose a smaller picture.');
    return result;
  } finally { bitmap.close(); }
};
