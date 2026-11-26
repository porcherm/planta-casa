/**
 * Prepara as fotos para enviar à IA: corrige a rotação (EXIF), reduz para no
 * máximo IA.ladoMaximoPx no lado maior e converte para JPEG em base64.
 * Fotos de celular de 4–12 MB viram algumas centenas de KB, o que deixa o envio
 * rápido sem perder detalhes como números escritos numa planta.
 */
import { IA } from '../../constants/ia.js';

/** Abre a imagem já na orientação certa (a câmera grava a rotação no EXIF). */
async function decodificar(arquivo) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(arquivo, { imageOrientation: 'from-image' }); } catch { /* tenta pelo <img> */ }
  }
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Retorna { base64, mediaType, largura, altura } pronto para a API.
 * Lança um erro amigável se o navegador não conseguir abrir o formato (ex.: HEIC fora do Safari).
 */
export async function prepararFoto(arquivo) {
  let imagem;
  try {
    imagem = await decodificar(arquivo);
  } catch {
    throw new Error(`Não foi possível abrir "${arquivo.name}". Use fotos em JPG, PNG ou WebP.`);
  }
  const w0 = imagem.width || imagem.naturalWidth;
  const h0 = imagem.height || imagem.naturalHeight;
  const escala = Math.min(1, IA.ladoMaximoPx / Math.max(w0, h0));
  const largura = Math.round(w0 * escala);
  const altura = Math.round(h0 * escala);

  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // PNG com transparência não fica com fundo preto no JPEG
  ctx.fillRect(0, 0, largura, altura);
  ctx.drawImage(imagem, 0, 0, largura, altura);
  imagem.close?.();

  const dataUrl = canvas.toDataURL('image/jpeg', IA.qualidadeJpeg);
  return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg', largura, altura };
}
