import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

// Estilo "adesivo": borda preta grossa + sombra sólida deslocada.
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg border-2 border-preto font-bold transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-x-0 disabled:active:translate-y-0',
  {
    variants: {
      variant: {
        default: 'bg-ambar text-preto shadow-adesivo-sm hover:bg-ambar-hover',
        outline: 'bg-bege text-preto shadow-adesivo-sm hover:bg-bege-escuro',
        ghost: 'border-transparent bg-transparent text-bege hover:bg-white/10',
        zap: 'bg-zap text-preto shadow-adesivo-sm hover:brightness-95',
      },
      size: {
        default: 'h-11 px-4 text-sm',
        sm: 'h-9 px-3 text-sm',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
