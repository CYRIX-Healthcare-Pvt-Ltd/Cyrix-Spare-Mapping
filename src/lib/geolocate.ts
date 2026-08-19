export interface GeocodedLocation {
  latitude: number
  longitude: number
  address: string
  city: string | null
  district: string | null
}

export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not supported on this device/browser.'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    })
  })
}

/** Nominatim (OpenStreetMap) — no API key needed, fine for this app's low, admin-only call volume. */
export async function reverseGeocode(latitude: number, longitude: number): Promise<GeocodedLocation> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('Could not resolve an address for that location.')
  const data = await res.json()
  const addr = data.address ?? {}
  return {
    latitude,
    longitude,
    address: data.display_name ?? '',
    city: addr.city ?? addr.town ?? addr.village ?? addr.suburb ?? null,
    district: addr.state_district ?? addr.county ?? null,
  }
}

export function geolocationErrorMessage(err: unknown): string {
  const code = typeof err === 'object' && err !== null && 'code' in err ? (err as { code: number }).code : null
  if (code === 1) return 'Location permission denied — allow location access and try again.'
  if (code === 2) return 'Could not determine your location. Try again outdoors or with GPS on.'
  if (code === 3) return 'Location request timed out. Try again.'
  return 'Could not get your location.'
}
