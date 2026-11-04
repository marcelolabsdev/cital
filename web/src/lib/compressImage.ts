/**
 * Comprime una imagen elegida en el navegador: reescala al lado máximo
 * indicado y exporta como WebP data-URL (nítida y con transparencia).
 * Si el navegador no soporta WebP cae a PNG, y si excede el presupuesto
 * a JPEG con calidad decreciente.
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
        // Fondo blanco bajo la imagen si el formato de salida no soporta alfa
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)

        /** Tamaño aproximado en BYTES de una data-URL (4 chars base64 → 3 bytes). */
        const bytes = (dataUrl: string) => Math.round(dataUrl.length * 0.75)

        // 1) WebP: bordes nítidos + canal alfa (lo que ve un logo PNG sin fondo blanco)
        let quality = 0.9
        let out = canvas.toDataURL('image/webp', quality)
        if (out.startsWith('data:image/webp')) {
          while (bytes(out) > maxBytes && quality > 0.5) {
            quality -= 0.15
            out = canvas.toDataURL('image/webp', quality)
          }
          if (bytes(out) <= maxBytes) {
            resolve(out)
            return
          }
        }

        // 2) PNG sin WebP disponible (casi todos los navegadores modernos lo tienen)
        out = canvas.toDataURL('image/png')
        if (bytes(out) <= maxBytes) {
          resolve(out)
          return
        }

        // 3) Último recurso: JPEG con calidad decreciente (pierde transparencia)
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        quality = 0.85
        out = canvas.toDataURL('image/jpeg', quality)
        while (bytes(out) > maxBytes && quality > 0.4) {
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
