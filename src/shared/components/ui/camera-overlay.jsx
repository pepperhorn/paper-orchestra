import { forwardRef } from 'react'
import { cn } from '@shared/lib/utils'

const CameraOverlay = forwardRef(function CameraOverlay(
  { videoRef, canvasRef, children, className },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        'relative aspect-[4/3] rounded-lg overflow-hidden bg-gray-950 border border-gray-200',
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
