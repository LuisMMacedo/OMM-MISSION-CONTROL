import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);
};

export const formatCompactCurrency = (value: number) => {
  if (value >= 1000) {
    return 'R$' + (value / 1000).toFixed(1) + 'k';
  }
  return formatCurrency(value);
};

export const getInitials = (name: string) => {
  return name
    .split(' ')
    .map((x) => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
};
