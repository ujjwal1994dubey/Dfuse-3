import * as React from "react"
import { useState, useEffect, useRef } from "react"
import { Share2, Copy, Check, X, Lock } from "lucide-react"
import { cn } from "../../lib/utils"

/**
 * ShareModal Component
 * A modal dialog for sharing canvas/dashboard links
 * Matches the app's design system with a clean, modern aesthetic
 */
export function ShareModal({ 
  isOpen, 
  onClose, 
  shareUrl, 
  expiresAt,
  isLoading = false,
  error = null 
}) {
  const [copied, setCopied] = useState(false)
  const inputRef = useRef(null)

  // Reset copied state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCopied(false)
    }
  }, [isOpen])

  // Auto-select link text when modal opens
  useEffect(() => {
    if (isOpen && shareUrl && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.select()
      }, 100)
    }
  }, [isOpen, shareUrl])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  const handleCopy = async () => {
    if (!shareUrl) return
    
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      // Fallback: select the text for manual copy
      inputRef.current?.select()
    }
  }

  const formatExpiryDate = (dateString) => {
    if (!dateString) return null
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-[1040] animate-fadeIn"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Modal */}
      <div 
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1050] w-full max-w-md animate-scaleIn"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
      >
        <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Content */}
          <div className="px-6 py-8">
            {/* Share Icon */}
            <div className="flex justify-center mb-5">
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
                <Share2 className="w-8 h-8 text-blue-600" />
              </div>
            </div>

            {/* Title */}
            <h2 
              id="share-modal-title"
              className="text-xl font-semibold text-gray-900 text-center mb-2"
            >
              Share Canvas
            </h2>

            {/* Description */}
            <p className="text-sm text-gray-500 text-center mb-6">
              Anyone with this link can view your canvas in read-only mode.
            </p>

            {isLoading ? (
              /* Loading State */
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
              </div>
            ) : error ? (
              /* Error State */
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-center">
                <p className="text-sm text-red-700">{error}</p>
                <button
                  onClick={onClose}
                  className="mt-3 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 rounded-lg transition-colors"
                >
                  Try Again
                </button>
              </div>
            ) : (
              /* Success State */
              <>
                {/* Link Input with Copy Button */}
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex-1 relative">
                    <input
                      ref={inputRef}
                      type="text"
                      value={shareUrl || ''}
                      readOnly
                      className="w-full px-4 py-3 pr-10 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono truncate"
                      onClick={(e) => e.target.select()}
                    />
                  </div>
                  <button
                    onClick={handleCopy}
                    className={cn(
                      "flex items-center gap-2 px-5 py-3 rounded-lg font-medium text-sm transition-all duration-200",
                      copied 
                        ? "bg-green-600 text-white" 
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    )}
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy link</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Expiry Info */}
                {expiresAt && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                    <Lock className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-amber-700">
                      This link will expire on <span className="font-medium">{formatExpiryDate(expiresAt)}</span>. 
                      The link is secured with end-to-end encryption.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Animation Styles */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { 
            opacity: 0; 
            transform: translate(-50%, -50%) scale(0.95);
          }
          to { 
            opacity: 1; 
            transform: translate(-50%, -50%) scale(1);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.15s ease-out;
        }
        .animate-scaleIn {
          animation: scaleIn 0.2s ease-out;
        }
      `}</style>
    </>
  )
}

export default ShareModal

