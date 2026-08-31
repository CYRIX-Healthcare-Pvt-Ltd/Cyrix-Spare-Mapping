/**
 * The shape of a sticker Cyrix issued.
 *
 * Every QR the company prints is `CYR/` and then the number --
 * `CYR/0000001`. Anything else in front of the camera belongs to somebody
 * else: the manufacturer's label on the machine beside the spare, a
 * parcel barcode, a payment QR on the wall. Taking one of those offers to
 * tag it as a new spare, and what lands in the list is then a record
 * nobody can ever scan again.
 *
 * Matched case-insensitively, and after trimming, so a sticker that reads
 * back with different case or a trailing newline is still recognised as
 * ours. The text itself is passed on untouched -- the lookup that follows
 * compares it to `qr_value` exactly, and a code "fixed" on the way
 * through would quietly stop matching the row it belongs to.
 */
export const QR_PREFIX = 'CYR/'

/** Said when the camera reads a code that is not one of ours. */
export const NOT_OUR_QR = 'That is not a Cyrix QR code. Scan the QR sticker shared by Cyrix.'

export function isCyrixQr(text: string): boolean {
  return text.trim().toUpperCase().startsWith(QR_PREFIX)
}
