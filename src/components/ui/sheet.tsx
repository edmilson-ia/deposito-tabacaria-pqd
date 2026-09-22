import * as Dialog from '@radix-ui/react-dialog'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const Sheet = Dialog.Root
export const SheetTitle = Dialog.Title
export const SheetDescription = Dialog.Description
export const SheetClose = Dialog.Close

/** Gaveta lateral (tela cheia no celular, 28rem no desktop). Foco preso e ESC fecham via Radix. */
export function SheetContent({ className, children, ...props }: ComponentProps<typeof Dialog.Content>) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60" />
      <Dialog.Content
        className={cn(
          'fixed inset-y-0 right-0 z-[70] flex w-full max-w-md flex-col border-l-2 border-preto bg-bege text-preto shadow-adesivo',
          className,
        )}
        {...props}
      >
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  )
}
