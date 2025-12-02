import * as React from "react"
import { useState, useEffect } from "react"
import { Info, X } from "lucide-react"
import { cn } from "../../lib/utils"

/**
 * Toast Component
 * A lightweight toast notification styled like the global filter toast
 */
export function Toast({ 
  isOpen, 
  onClose, 
  message, 
  type = 'success', // 'success' | 'error' | 'warning' | 'info'
  duration = 4000
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true)
      setIsExiting(false)
      
      // Auto-dismiss after duration
      const timer = setTimeout(() => {
        handleClose()
      }, duration)
      
      return () => clearTimeout(timer)
    }
  }, [isOpen, duration])

  const handleClose = () => {
    setIsExiting(true)
    setTimeout(() => {
      setIsVisible(false)
      onClose?.()
    }, 200)
  }

  if (!isVisible) return null

  // Background colors matching global filter toast style
  const backgrounds = {
    success: 'bg-[#4CAF93]', // Teal green like the filter toast
    error: 'bg-red-500',
    warning: 'bg-amber-500',
    info: 'bg-blue-500'
  }

  return (
    <div 
      className={cn(
        "fixed z-[9999] top-4 left-1/2 -translate-x-1/2 transition-all duration-200",
        isExiting ? "opacity-0 -translate-y-2" : "opacity-100 translate-y-0"
      )}
      style={{
        animation: !isExiting ? 'toastSlideDown 0.25s ease-out' : undefined
      }}
    >
      <div 
        className={cn(
          "flex items-center gap-3 px-5 py-3 rounded-full shadow-lg",
          backgrounds[type]
        )}
      >
        {/* Info Icon */}
        <Info className="w-5 h-5 text-white flex-shrink-0" />
        
        {/* Message */}
        <p className="text-white text-sm font-medium whitespace-nowrap">
          {message}
        </p>
        
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="p-1 rounded-full hover:bg-white/20 transition-colors ml-1"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4 text-white" />
        </button>
      </div>

      <style>{`
        @keyframes toastSlideDown {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </div>
  )
}

export default Toast

