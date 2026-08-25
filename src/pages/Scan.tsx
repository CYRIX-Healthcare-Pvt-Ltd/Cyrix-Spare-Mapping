import { useCallback, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { QRScanner } from '../components/QRScanner'
import { Toast } from '../components/Toast'
import { supabase } from '../lib/supabaseClient'
import { AlertIcon } from '../components/icons'

export default function Scan() {
  const navigate = useNavigate()
  const location = useLocation()
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>((location.state as { toast?: string } | null)?.toast ?? null)

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
      {toast && (
        <Toast
          message={toast}
          // The only toast here is "spare added", and the first thing you want
          // after saving one is to see it in the list it just joined.
          action={{ label: 'View tagged', to: '/tagged' }}
          onDismiss={() => {
            setToast(null)
            navigate(location.pathname, { replace: true })
          }}
        />
      )}
      <QRScanner onDecode={handleDecode} />
      {lookupError && (
        <p className="mx-auto flex max-w-sm items-center gap-1.5 px-4 text-sm text-red-600">
          <AlertIcon className="h-4 w-4 shrink-0" /> {lookupError}
        </p>
      )}
    </div>
  )
}
