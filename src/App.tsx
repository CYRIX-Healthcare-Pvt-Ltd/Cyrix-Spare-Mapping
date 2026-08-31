import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import Dashboard from './pages/Dashboard'
import Scan from './pages/Scan'
import EquipmentNew from './pages/EquipmentNew'
import EquipmentView from './pages/EquipmentView'
import EditRequests from './pages/EditRequests'
import TaggedEquipment from './pages/TaggedEquipment'
import Account from './pages/Account'
import Facilities from './pages/admin/Facilities'
import Fields from './pages/admin/Fields'
import Users from './pages/admin/Users'
import Settings from './pages/admin/Settings'
import ItemMasters from './pages/admin/ItemMasters'

export default function App() {
  return (
    <BrowserRouter basename="/spare">
      <ThemeProvider>
      <AuthProvider>
        <Routes>
          {/* No /login here any more: signing in belongs to the portal at
              app.cyrix.in, and one module keeping its own login is how you
              end up asked for a password twice. An old bookmark to it now
              falls through to "*" and lands on the dashboard, which sends
              you to the portal if you are not signed in. */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/scan" element={<Scan />} />
            <Route path="/equipment/new" element={<EquipmentNew />} />
            <Route path="/equipment/:id" element={<EquipmentView />} />
            <Route path="/requests" element={<EditRequests />} />
            <Route path="/tagged" element={<TaggedEquipment />} />
            <Route path="/items" element={<ItemMasters />} />
            <Route path="/account" element={<Account />} />

            {/*
              Warehouses, logins and settings are setting up the software,
              not running Spare, so they sit with every other module's
              setup on the shared Administration screen and are reachable
              here only by the account that administers it.

              Guarded rather than merely unlinked: the routes still exist,
              so hiding the tile alone would leave anybody who knows the
              URL walking straight in.
            */}
            <Route
              path="/admin/facilities"
              element={
                <ProtectedRoute roles={['admin']} swAdminOnly>
                  <Facilities />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/fields"
              element={
                <ProtectedRoute roles={['admin']}>
                  <Fields />
                </ProtectedRoute>
              }
            />
            {/* Kept so existing links and bookmarks still land somewhere. */}
            <Route path="/admin/items" element={<Navigate to="/items" replace />} />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute roles={['admin']} swAdminOnly>
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/settings"
              element={
                <ProtectedRoute roles={['admin']} swAdminOnly>
                  <Settings />
                </ProtectedRoute>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
