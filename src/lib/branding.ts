/**
 * What the customer's own catalogue is called on screen.
 *
 * The app maps two catalogues onto each other -- the customer's part numbers,
 * printed on the spares in their warehouse, and Cyrix's own naming for the
 * same parts -- so the two need distinguishable names wherever they appear
 * together. The customer must not be named, so it is described by its role
 * instead.
 *
 * It lives here as one constant rather than as a word typed into thirty
 * strings, so changing what the customer is called is one edit and cannot
 * leave half the app saying something else.
 */
export const CLIENT = 'Client'

/** The same word mid-sentence. */
export const client = CLIENT.toLowerCase()

/** For filenames, which are lower case and have no spaces. */
export const clientSlug = CLIENT.toLowerCase().replace(/\s+/g, '_')
