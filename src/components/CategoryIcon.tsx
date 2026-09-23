import { Beer, Candy, Cigarette, Coffee, CupSoda, GlassWater, Package, Snowflake, Wine, Zap, type LucideIcon } from 'lucide-react'

const ICONES: Record<string, LucideIcon> = {
  Cervejas: Beer,
  Refrigerantes: CupSoda,
  Energéticos: Zap,
  'Bebidas Mistas': GlassWater,
  'Vinhos e Chopp': Wine,
  'Chopp de Vinho': Wine,
  'Águas e Sucos': GlassWater,
  Gelo: Snowflake,
  Tabacaria: Cigarette,
  'Doces e Balas': Candy,
  Alimentos: Coffee,
  Whisky: GlassWater,
  Gin: GlassWater,
  Licor: GlassWater,
  Vodka: GlassWater,
}

export function CategoryIcon({ nome, className }: { nome: string; className?: string }) {
  const Icon = ICONES[nome] ?? Package
  return <Icon className={className} aria-hidden />
}
