import * as Collapsible from '@radix-ui/react-collapsible'
import { cn } from '@shared/lib/utils'

export default function SettingsPanel({ open, onOpenChange, trigger, children, className }) {
  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange} className={cn('w-full max-w-[600px]', className)}>
      {trigger && (
        <Collapsible.Trigger asChild>
          {trigger}
        </Collapsible.Trigger>
      )}
      <Collapsible.Content className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg p-3 mt-1.5 flex flex-col gap-3">
          {children}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
