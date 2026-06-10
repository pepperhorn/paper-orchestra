import * as Collapsible from '@radix-ui/react-collapsible'
import { cn } from '@shared/lib/utils'

export default function SettingsPanel({ open, onOpenChange, trigger, children, className }) {
  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange} className={cn('w-full', className)}>
      {trigger && (
        <Collapsible.Trigger asChild>
          {trigger}
        </Collapsible.Trigger>
      )}
      <Collapsible.Content className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
        <div className="bg-gray-50/80 border border-gray-200 rounded-lg p-4 mt-2 flex flex-col gap-4">
          {children}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
