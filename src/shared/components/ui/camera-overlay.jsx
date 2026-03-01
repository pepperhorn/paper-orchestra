import { forwardRef } from 'react'
import { cn } from '@shared/lib/utils'

const CameraOverlay = forwardRef(function CameraOverlay(
  { videoRef, canvasRef, status = 'loading', children, className },
  ref
) {
  const borderColor = status === 'ready'
    ? 'border-accent/30'
    : 'border-white/10'

  return (
    <div
      ref={ref}
      className={cn(
        'relative aspect-[4/3] rounded-lg overflow-hidden bg-black border-2',
        borderColor,
        className
      )}
    >
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        className="w-full h-full block"
      />
      {children}
    </div>
  )
})

export default CameraOverlay
