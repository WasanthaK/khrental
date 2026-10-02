export const normalizeTextAlignment = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['left', 'center', 'right'].includes(normalized) ? normalized : 'left';
};

export const readBlockTextAlignment = (element) => {
  if (!element) return 'left';

  const inline = element.style?.textAlign;
  if (inline) return normalizeTextAlignment(inline);

  const attr = typeof element.getAttribute === 'function' ? element.getAttribute('align') : null;
  return normalizeTextAlignment(attr);
};

export const alignedTextX = ({ alignment, margin, pageWidth, textWidth }) => {
  const usableWidth = pageWidth - (margin * 2);
  if (alignment === 'center') {
    return margin + Math.max(0, (usableWidth - textWidth) / 2);
  }
  if (alignment === 'right') {
    return margin + Math.max(0, usableWidth - textWidth);
  }
  return margin;
};
