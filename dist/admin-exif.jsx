/* admin-exif.jsx — real EXIF extraction for dropped-in photos.

   We only pull the fields we actually display:
   - dateTaken (DateTimeOriginal → ISO string)
   - dimensions (Image width × height)
   - fileSize  (from File.size, not EXIF)

   Camera / lens / ISO / aperture / shutter are deliberately NOT extracted.
   The product spec says these must never appear in the UI, so the easiest
   way to enforce that is to never read them. */

async function parseExif(file) {
  const out = { dateTaken: null, dimensions: '', fileSize: file.size };

  // exifr is loaded via CDN as window.exifr
  if (window.exifr) {
    try {
      const data = await window.exifr.parse(file, {
        pick: ['DateTimeOriginal', 'CreateDate', 'ExifImageWidth', 'ExifImageHeight'],
      });
      if (data) {
        const dt = data.DateTimeOriginal || data.CreateDate;
        if (dt instanceof Date && !isNaN(dt)) out.dateTaken = dt.toISOString();
        if (data.ExifImageWidth && data.ExifImageHeight) {
          out.dimensions = `${data.ExifImageWidth}×${data.ExifImageHeight}`;
        }
      }
    } catch (_) { /* not all files have EXIF; that's fine */ }
  }

  // Fallback for dimensions: decode the image directly.
  if (!out.dimensions) {
    try {
      const url = URL.createObjectURL(file);
      const dims = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(`${img.naturalWidth}×${img.naturalHeight}`);
        img.onerror = () => resolve('');
        img.src = url;
      });
      URL.revokeObjectURL(url);
      out.dimensions = dims;
    } catch (_) {}
  }

  // Fallback for date: file's lastModified — better than nothing.
  if (!out.dateTaken && file.lastModified) {
    out.dateTaken = new Date(file.lastModified).toISOString();
  }
  return out;
}

window.parseExif = parseExif;
