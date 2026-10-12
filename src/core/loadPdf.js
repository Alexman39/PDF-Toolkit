import { PDFDocument } from 'pdf-lib';
import { CorruptPdfError, EncryptedPdfError, NotPdfError } from './errors.js';
import { hasPdfHeader } from './pdfHeader.js';

/**
 * Loads PDF bytes into a pdf-lib document, turning every failure into a typed error.
 * @param {Uint8Array | ArrayBuffer} bytes
 * @returns {Promise<PDFDocument>}
 * @throws {NotPdfError} When the bytes lack a `%PDF-` header.
 * @throws {EncryptedPdfError} When the PDF is encrypted (even owner-password-only).
 * @throws {CorruptPdfError} When the PDF cannot be parsed or has no pages.
 */
export async function loadPdf(bytes) {
  if (!hasPdfHeader(bytes)) throw new NotPdfError();

  let doc;
  try {
    // ignoreEncryption lets us detect encryption via `isEncrypted` instead of matching
    // pdf-lib's EncryptedPDFError, which fails `instanceof` because pdf-lib is compiled to ES5.
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch (error) {
    // pdf-lib throws a mix of its own errors and plain TypeErrors on bad input.
    throw new CorruptPdfError(undefined, { cause: error });
  }

  // pdf-lib cannot decrypt, so copying pages would produce unreadable output. Viewers open
  // owner-password-only files silently, but they are still encrypted on disk.
  if (doc.isEncrypted) throw new EncryptedPdfError();

  let pageCount;
  try {
    pageCount = doc.getPageCount();
  } catch (error) {
    throw new CorruptPdfError('PDF page tree is broken', { cause: error });
  }
  // pdf-lib is lenient and can "load" damaged files that have no reachable pages.
  if (pageCount === 0) throw new CorruptPdfError('PDF has no pages');

  return doc;
}
