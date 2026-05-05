const COLOR_ALIAS_TO_LABEL: Record<string, string> = {
  preto: 'Preto',
  black: 'Preto',
  branco: 'Branco',
  white: 'Branco',
  offwhite: 'Off white',
  'off white': 'Off white',
  off_white: 'Off white',
  bege: 'Bege',
  beige: 'Bege',
  nude: 'Bege',
  creme: 'Bege',
  cream: 'Bege',
  marfim: 'Off white',
  ivory: 'Off white',
  cinza: 'Cinza',
  gray: 'Cinza',
  grey: 'Cinza',
  chumbo: 'Grafite',
  grafite: 'Grafite',
  grafito: 'Grafite',
  azul: 'Azul',
  blue: 'Azul',
  azulmarinho: 'Azul marinho',
  'azul marinho': 'Azul marinho',
  navy: 'Azul marinho',
  vermelho: 'Vermelho',
  red: 'Vermelho',
  vinho: 'Vinho',
  burgundy: 'Vinho',
  bordô: 'Vinho',
  bordo: 'Vinho',
  rosa: 'Rosa',
  pink: 'Rosa',
  roxo: 'Roxo',
  purple: 'Roxo',
  lilas: 'Lilas',
  lilac: 'Lilas',
  verde: 'Verde',
  green: 'Verde',
  oliva: 'Oliva',
  olive: 'Oliva',
  amarelo: 'Amarelo',
  yellow: 'Amarelo',
  laranja: 'Laranja',
  orange: 'Laranja',
  marrom: 'Marrom',
  brown: 'Marrom',
  caramelo: 'Caramelo',
  camel: 'Caramelo',
  dourado: 'Dourado',
  gold: 'Dourado',
  prata: 'Prata',
  silver: 'Prata',
  transparente: 'Transparente',
  transparent: 'Transparente',
};

const normalizeKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const toTitleCase = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export function normalizeProductColorLabel(value: string) {
  const normalized = normalizeKey(value);
  if (normalized.startsWith('#')) {
    return normalized;
  }
  return COLOR_ALIAS_TO_LABEL[normalized] || toTitleCase(value.trim() || 'Cor');
}

export function normalizeProductColorLabels(values: string[]) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => normalizeProductColorLabel(value))
        .filter(Boolean),
    ),
  );
}
