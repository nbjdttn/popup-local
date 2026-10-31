export const colors = {
  bg: '#FFF8F3',
  card: '#FFFFFF',
  text: '#1F1A17',
  muted: '#7A6F68',
  border: '#EADFD6',
  popup: '#E8467C', // pink accent for the Pop-ups tab
  deal: '#1E9E6A', // green accent for the Deals tab
  danger: '#C0392B',
};

export function accentFor(kind: 'popup' | 'deal') {
  return kind === 'popup' ? colors.popup : colors.deal;
}
