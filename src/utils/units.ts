import { BaseUnit } from '@prisma/client';

export type SupportedUnit =
  | 'kg'
  | 'grams'
  | 'g'
  | 'litres'
  | 'l'
  | 'ml'
  | 'pieces'
  | 'pcs'
  | 'packets'
  | 'pkt'
  | 'cartons'
  | 'ctn';

const NORMALIZE_MAP: Record<string, { baseUnit: BaseUnit; factor: number; canonical: string }> = {
  kg: { baseUnit: BaseUnit.GRAM, factor: 1000, canonical: 'kg' },
  kilogram: { baseUnit: BaseUnit.GRAM, factor: 1000, canonical: 'kg' },
  kilograms: { baseUnit: BaseUnit.GRAM, factor: 1000, canonical: 'kg' },
  g: { baseUnit: BaseUnit.GRAM, factor: 1, canonical: 'grams' },
  gm: { baseUnit: BaseUnit.GRAM, factor: 1, canonical: 'grams' },
  gms: { baseUnit: BaseUnit.GRAM, factor: 1, canonical: 'grams' },
  gram: { baseUnit: BaseUnit.GRAM, factor: 1, canonical: 'grams' },
  grams: { baseUnit: BaseUnit.GRAM, factor: 1, canonical: 'grams' },

  l: { baseUnit: BaseUnit.ML, factor: 1000, canonical: 'litres' },
  litre: { baseUnit: BaseUnit.ML, factor: 1000, canonical: 'litres' },
  litres: { baseUnit: BaseUnit.ML, factor: 1000, canonical: 'litres' },
  liter: { baseUnit: BaseUnit.ML, factor: 1000, canonical: 'litres' },
  liters: { baseUnit: BaseUnit.ML, factor: 1000, canonical: 'litres' },
  ml: { baseUnit: BaseUnit.ML, factor: 1, canonical: 'ml' },

  piece: { baseUnit: BaseUnit.PIECE, factor: 1, canonical: 'pieces' },
  pieces: { baseUnit: BaseUnit.PIECE, factor: 1, canonical: 'pieces' },
  pc: { baseUnit: BaseUnit.PIECE, factor: 1, canonical: 'pieces' },
  pcs: { baseUnit: BaseUnit.PIECE, factor: 1, canonical: 'pieces' },
  packet: { baseUnit: BaseUnit.PIECE, factor: 1, canonical: 'packets' },
  packets: { baseUnit: BaseUnit.PIECE, factor: 1, canonical: 'packets' },
  pkt: { baseUnit: BaseUnit.PIECE, factor: 1, canonical: 'packets' },
  carton: { baseUnit: BaseUnit.PIECE, factor: 1, canonical: 'cartons' },
  cartons: { baseUnit: BaseUnit.PIECE, factor: 1, canonical: 'cartons' },
  ctn: { baseUnit: BaseUnit.PIECE, factor: 1, canonical: 'cartons' },
};

export function parseUnit(unit: string): { baseUnit: BaseUnit; factor: number; canonical: string } {
  const key = unit.trim().toLowerCase();
  const entry = NORMALIZE_MAP[key];
  if (!entry) {
    throw new Error(`Unsupported unit: "${unit}". Supported units: kg, grams, litres, ml, pieces, packets, cartons.`);
  }
  return entry;
}

/**
 * Converts a display quantity + unit to integer base units (GRAM, ML, PIECE).
 * Supports carton-to-packet conversion when packetsPerCarton is supplied.
 */
export function toBaseQuantity(
  quantity: number,
  unit: string,
  expectedBaseUnit?: BaseUnit,
  packetsPerCarton?: number,
): number {
  if (quantity < 0 || !Number.isFinite(quantity)) {
    throw new Error(`Invalid quantity: ${quantity}`);
  }
  const key = unit.trim().toLowerCase();
  if ((key === 'carton' || key === 'cartons' || key === 'ctn') && packetsPerCarton && packetsPerCarton > 0) {
    return Math.round(quantity * packetsPerCarton);
  }
  const parsed = parseUnit(unit);
  if (expectedBaseUnit && parsed.baseUnit !== expectedBaseUnit) {
    throw new Error(`Unit "${unit}" (${parsed.baseUnit}) is incompatible with material base unit ${expectedBaseUnit}`);
  }
  return Math.round(quantity * parsed.factor);
}

/**
 * Converts a base quantity back to display unit (e.g., 120000 GRAM -> 120 kg).
 */
export function fromBaseQuantity(quantityBase: bigint | number, displayUnit: string): number {
  const base = typeof quantityBase === 'bigint' ? Number(quantityBase) : quantityBase;
  const parsed = parseUnit(displayUnit);
  return Number((base / parsed.factor).toFixed(4));
}

/**
 * Converts a rate per display unit (e.g., ₹45/kg = 4500 paisa/kg)
 * and a quantity in display unit to total integer paisa.
 */
export function calcLineCostFromDisplay(quantity: number, ratePerDisplayUnitPaisa: number): number {
  return Math.round(quantity * ratePerDisplayUnitPaisa);
}

/**
 * Computes weighted average rate per display unit (in paisa) from base stock and total value.
 */
export function weightedAvgRatePerDisplayUnitPaisa(
  totalValuePaisa: bigint | number,
  currentStockBase: bigint | number,
  displayUnit: string,
): number {
  const stock = typeof currentStockBase === 'bigint' ? Number(currentStockBase) : currentStockBase;
  if (stock <= 0) return 0;
  const val = typeof totalValuePaisa === 'bigint' ? Number(totalValuePaisa) : totalValuePaisa;
  const { factor } = parseUnit(displayUnit);
  return Math.round((val * factor) / stock);
}

export function convertBetweenUnits(
  quantity: number,
  fromUnit: string,
  toUnit: string,
  packetsPerCarton = 20,
): number {
  const fromKey = fromUnit.trim().toLowerCase();
  const toKey = toUnit.trim().toLowerCase();

  // Finished good packet <-> carton conversion
  const isPacketFrom = ['packet', 'packets', 'pkt'].includes(fromKey);
  const isCartonFrom = ['carton', 'cartons', 'ctn'].includes(fromKey);
  const isPacketTo = ['packet', 'packets', 'pkt'].includes(toKey);
  const isCartonTo = ['carton', 'cartons', 'ctn'].includes(toKey);

  if (isCartonFrom && isPacketTo) return Number((quantity * packetsPerCarton).toFixed(4));
  if (isPacketFrom && isCartonTo) return Number((quantity / packetsPerCarton).toFixed(4));

  const fromParsed = parseUnit(fromUnit);
  const toParsed = parseUnit(toUnit);
  if (fromParsed.baseUnit !== toParsed.baseUnit) {
    throw new Error(`Cannot convert ${fromUnit} (${fromParsed.baseUnit}) to ${toUnit} (${toParsed.baseUnit})`);
  }
  const baseQty = quantity * fromParsed.factor;
  return Number((baseQty / toParsed.factor).toFixed(4));
}
