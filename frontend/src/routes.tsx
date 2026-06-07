import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { PortalLayout } from '@/components/layout/PortalLayout'
import { RoleGuard } from '@/components/RoleGuard'
import { Landing } from '@/pages/Landing'
import { Login } from '@/pages/auth/Login'
import { Signup } from '@/pages/auth/Signup'
import { NotFound } from '@/pages/NotFound'

const CustomerDashboard = lazy(() => import('@/pages/customer/Dashboard').then(m => ({ default: m.CustomerDashboard })))
const CustomerProfile = lazy(() => import('@/pages/customer/Profile').then(m => ({ default: m.CustomerProfile })))
const CustomerNewRequest = lazy(() => import('@/pages/customer/NewRequest').then(m => ({ default: m.CustomerNewRequest })))
const CustomerRequestList = lazy(() => import('@/pages/customer/RequestList').then(m => ({ default: m.CustomerRequestList })))
const CustomerRequestDetail = lazy(() => import('@/pages/customer/RequestDetail').then(m => ({ default: m.CustomerRequestDetail })))
const CustomerPay = lazy(() => import('@/pages/customer/Pay').then(m => ({ default: m.CustomerPay })))
const CustomerPaymentReturn = lazy(() => import('@/pages/customer/PaymentReturn').then(m => ({ default: m.CustomerPaymentReturn })))

const DriverDashboard = lazy(() => import('@/pages/driver/Dashboard').then(m => ({ default: m.DriverDashboard })))
const DriverOnboard = lazy(() => import('@/pages/driver/Onboard').then(m => ({ default: m.DriverOnboard })))
const DriverJobHistory = lazy(() => import('@/pages/driver/JobHistory').then(m => ({ default: m.DriverJobHistory })))
const DriverJobDetail = lazy(() => import('@/pages/driver/JobDetail').then(m => ({ default: m.DriverJobDetail })))

const FleetDashboard = lazy(() => import('@/pages/fleet/Dashboard').then(m => ({ default: m.FleetDashboard })))
const FleetSignup = lazy(() => import('@/pages/fleet/Signup').then(m => ({ default: m.FleetSignup })))
const FleetDrivers = lazy(() => import('@/pages/fleet/Drivers').then(m => ({ default: m.FleetDrivers })))
const FleetJobs = lazy(() => import('@/pages/fleet/Jobs').then(m => ({ default: m.FleetJobs })))
const FleetEarnings = lazy(() => import('@/pages/fleet/Earnings').then(m => ({ default: m.FleetEarnings })))

const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard').then(m => ({ default: m.AdminDashboard })))
const AdminApprovals = lazy(() => import('@/pages/admin/Approvals').then(m => ({ default: m.AdminApprovals })))
const AdminPricing = lazy(() => import('@/pages/admin/Pricing').then(m => ({ default: m.AdminPricing })))
const AdminTransactions = lazy(() => import('@/pages/admin/Transactions').then(m => ({ default: m.AdminTransactions })))
const AdminFlagged = lazy(() => import('@/pages/admin/Flagged').then(m => ({ default: m.AdminFlagged })))
const AdminDisputes = lazy(() => import('@/pages/admin/Disputes').then(m => ({ default: m.AdminDisputes })))
const AdminUsers = lazy(() => import('@/pages/admin/Users').then(m => ({ default: m.AdminUsers })))
const AdminUserDetail = lazy(() => import('@/pages/admin/UserDetail').then(m => ({ default: m.AdminUserDetail })))
const AdminRegions = lazy(() => import('@/pages/admin/Regions').then(m => ({ default: m.AdminRegions })))

const AccountSecurity = lazy(() => import('@/pages/account/Security').then(m => ({ default: m.AccountSecurity })))

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

export function AppRoutes() {
  return (
    <Suspense fallback={null}>
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
