import * as React from "react"
import { cn } from "../../lib/utils"
import { Button } from "./button"
import { Upload } from "lucide-react"

const FileUpload = React.forwardRef(({ className, onFileChange, onFilesChange, accept, multiple, children, ...props }, ref) => {
  const inputRef = React.useRef(null)

  const handleClick = () => {
    inputRef.current?.click()
  }

  const handleChange = (event) => {
    const files = event.target.files
    if (!files || files.length === 0) return
    if (multiple && onFilesChange) {
      onFilesChange(Array.from(files))
    } else if (onFileChange) {
      onFileChange(files[0])
    }
    // Reset so the same file(s) can be re-selected
    event.target.value = ''
  }

  return (
    <div className={cn("", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        className="hidden"
      />
      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
        className="w-full justify-center gap-2"
      >
        <Upload size={16} />
        {children || "Choose File"}
      </Button>
    </div>
  )
})
FileUpload.displayName = "FileUpload"

export { FileUpload }
