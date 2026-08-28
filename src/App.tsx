import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import Login from './pages/Login'
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
          <Route path="/login" element={<Login />} />

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

            <Route
              path="/admin/facilities"
              element={
                <ProtectedRoute roles={['admin']}>
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
                <ProtectedRoute roles={['admin']}>
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/settings"
              element={
                <ProtectedRoute roles={['admin']}>
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
