import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRScanner } from '../components/QRScanner'
import { supabase } from '../lib/supabaseClient'
import { AlertIcon } from '../components/icons'

export default function Scan() {
  const navigate = useNavigate()
  const [lookupError, setLookupError] = useState<string | null>(null)

  const handleDecode = useCallback(
    async (text: string) => {
      setLookupError(null)
      const { data, error } = await supabase.from('equipment').select('id').eq('qr_value', text).maybeSingle()

      if (error) {
        setLookupError('Could not look that code up. Check your connection and try again.')
        return
      }

      if (data) {
        navigate(`/equipment/${data.id}`)
      } else {
        navigate(`/equipment/new?qr=${encodeURIComponent(text)}`)
      }
    },
    [navigate]
  )

  return (
    <div>
      <QRScanner onDecode={handleDecode} />
      {lookupError && (
        <p className="mx-auto flex max-w-sm items-center gap-1.5 px-4 text-sm text-red-600">
          <AlertIcon className="h-4 w-4 shrink-0" /> {lookupError}
        </p>
      )}
    </div>
  )
}
