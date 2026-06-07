import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { PortalLayout } from '@/components/layout/PortalLayout'
import { RoleGuard } from '@/components/RoleGuard'
import { Landing } from '@/pages/Landing'
import { Login } from '@/pages/auth/Login'
import { Signup } from '@/pages/auth/Signup'
import { NotFound } from '@/pages/NotFound'
import { load } from '@/lib/routeLoaders'

const CustomerDashboard = lazy(() => load.CustomerDashboard().then(m => ({ default: m.CustomerDashboard })))
const CustomerProfile = lazy(() => load.CustomerProfile().then(m => ({ default: m.CustomerProfile })))
const CustomerNewRequest = lazy(() => load.CustomerNewRequest().then(m => ({ default: m.CustomerNewRequest })))
const CustomerRequestList = lazy(() => load.CustomerRequestList().then(m => ({ default: m.CustomerRequestList })))
const CustomerRequestDetail = lazy(() => load.CustomerRequestDetail().then(m => ({ default: m.CustomerRequestDetail })))
const CustomerPay = lazy(() => load.CustomerPay().then(m => ({ default: m.CustomerPay })))
const CustomerPaymentReturn = lazy(() => load.CustomerPaymentReturn().then(m => ({ default: m.CustomerPaymentReturn })))

const DriverDashboard = lazy(() => load.DriverDashboard().then(m => ({ default: m.DriverDashboard })))
const DriverOnboard = lazy(() => load.DriverOnboard().then(m => ({ default: m.DriverOnboard })))
const DriverJobHistory = lazy(() => load.DriverJobHistory().then(m => ({ default: m.DriverJobHistory })))
const DriverJobDetail = lazy(() => load.DriverJobDetail().then(m => ({ default: m.DriverJobDetail })))

const FleetDashboard = lazy(() => load.FleetDashboard().then(m => ({ default: m.FleetDashboard })))
const FleetSignup = lazy(() => load.FleetSignup().then(m => ({ default: m.FleetSignup })))
const FleetDrivers = lazy(() => load.FleetDrivers().then(m => ({ default: m.FleetDrivers })))
const FleetJobs = lazy(() => load.FleetJobs().then(m => ({ default: m.FleetJobs })))
const FleetEarnings = lazy(() => load.FleetEarnings().then(m => ({ default: m.FleetEarnings })))

const AdminDashboard = lazy(() => load.AdminDashboard().then(m => ({ default: m.AdminDashboard })))
const AdminApprovals = lazy(() => load.AdminApprovals().then(m => ({ default: m.AdminApprovals })))
const AdminPricing = lazy(() => load.AdminPricing().then(m => ({ default: m.AdminPricing })))
const AdminTransactions = lazy(() => load.AdminTransactions().then(m => ({ default: m.AdminTransactions })))
const AdminFlagged = lazy(() => load.AdminFlagged().then(m => ({ default: m.AdminFlagged })))
const AdminDisputes = lazy(() => load.AdminDisputes().then(m => ({ default: m.AdminDisputes })))
const AdminUsers = lazy(() => load.AdminUsers().then(m => ({ default: m.AdminUsers })))
const AdminUserDetail = lazy(() => load.AdminUserDetail().then(m => ({ default: m.AdminUserDetail })))
const AdminRegions = lazy(() => load.AdminRegions().then(m => ({ default: m.AdminRegions })))

const AccountSecurity = lazy(() => load.AccountSecurity().then(m => ({ default: m.AccountSecurity })))

const customerNav = [
  { to: '/customer', label: 'Dashboard' },
  { to: '/customer/new', label: 'New request' },
  { to: '/customer/requests', label: 'My requests' },
  { to: '/customer/profile', label: 'Profile' },
]

const driverNav = [
  { to: '/driver', label: 'Dashboard' },
  { to: '/driver/history', label: 'History' },
  { to: '/driver/onboard', label: 'Profile & docs' },
  { to: '/driver/security', label: 'Security' },
]

const fleetNav = [
  { to: '/fleet', label: 'Overview' },
  { to: '/fleet/drivers', label: 'Drivers' },
  { to: '/fleet/jobs', label: 'Jobs' },
  { to: '/fleet/earnings', label: 'Earnings' },
  { to: '/fleet/signup', label: 'Company' },
  { to: '/fleet/security', label: 'Security' },
]

const adminNav = [
  { to: '/admin', label: 'Overview' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/drivers', label: 'Drivers' },
  { to: '/admin/approvals', label: 'Approvals' },
  { to: '/admin/pricing', label: 'Pricing' },
  { to: '/admin/regions', label: 'Towns' },
  { to: '/admin/transactions', label: 'Transactions' },
  { to: '/admin/flagged', label: 'Flagged users' },
  { to: '/admin/disputes', label: 'Disputes' },
  { to: '/admin/security', label: 'Security' },
]

function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-24" role="status" aria-label="Loading">
      <span className="w-7 h-7 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
    </div>
  )
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Landing />} />
        </Route>
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<Signup />} />

        <Route
          path="customer"
          element={
            <RoleGuard allow={['customer']}>
              <PortalLayout title="Customer" navItems={customerNav} />
            </RoleGuard>
          }
        >
          <Route index element={<CustomerDashboard />} />
          <Route path="new" element={<CustomerNewRequest />} />
          <Route path="requests" element={<CustomerRequestList />} />
          <Route path="requests/:id" element={<CustomerRequestDetail />} />
          <Route path="requests/:id/pay" element={<CustomerPay />} />
          <Route path="payment-return" element={<CustomerPaymentReturn />} />
          <Route path="profile" element={<CustomerProfile />} />
        </Route>

        <Route
          path="driver"
          element={
            <RoleGuard allow={['driver']}>
              <PortalLayout title="Driver" navItems={driverNav} />
            </RoleGuard>
          }
        >
          <Route index element={<DriverDashboard />} />
          <Route path="history" element={<DriverJobHistory />} />
          <Route path="history/:id" element={<DriverJobDetail />} />
          <Route path="onboard" element={<DriverOnboard />} />
          <Route path="security" element={<AccountSecurity />} />
        </Route>

        <Route
          path="fleet"
          element={
            <RoleGuard allow={['fleet_admin']}>
              <PortalLayout title="Fleet" navItems={fleetNav} />
            </RoleGuard>
          }
        >
          <Route index element={<FleetDashboard />} />
          <Route path="drivers" element={<FleetDrivers />} />
          <Route path="jobs" element={<FleetJobs />} />
          <Route path="earnings" element={<FleetEarnings />} />
          <Route path="signup" element={<FleetSignup />} />
          <Route path="security" element={<AccountSecurity />} />
        </Route>

        <Route
          path="admin"
          element={
            <RoleGuard allow={['admin']}>
              <PortalLayout title="Admin" navItems={adminNav} />
            </RoleGuard>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers key="all" />} />
          <Route path="users/:id" element={<AdminUserDetail />} />
          <Route
            path="drivers"
            element={<AdminUsers key="drivers" initialRole="driver" />}
          />
          <Route path="approvals" element={<AdminApprovals />} />
          <Route path="pricing" element={<AdminPricing />} />
          <Route path="regions" element={<AdminRegions />} />
          <Route path="transactions" element={<AdminTransactions />} />
          <Route path="flagged" element={<AdminFlagged />} />
          <Route path="disputes" element={<AdminDisputes />} />
          <Route path="security" element={<AccountSecurity />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
