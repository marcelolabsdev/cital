/**
 * Comprime una imagen elegida en el navegador: reescala al lado máximo
 * indicado y exporta como JPEG data-URL lista para guardar en la D1.
 */
export function compressImage(file: File, maxSize: number, maxBytes = 150_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('El archivo no es una imagen válida'))
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('No se pudo procesar la imagen'))
          return
        }
        // Fondo blanco: las PNG con transparencia se ven bien sobre JPEG
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        // Si excede el presupuesto bajamos la calidad hasta que quepa
        let quality = 0.85
        let out = canvas.toDataURL('image/jpeg', quality)
        while (out.length * 0.75 > maxBytes && quality > 0.4) {
          quality -= 0.15
          out = canvas.toDataURL('image/jpeg', quality)
        }
        resolve(out)
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
