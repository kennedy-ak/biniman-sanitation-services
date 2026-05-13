import { Route, Routes } from 'react-router-dom'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { PortalLayout } from '@/components/layout/PortalLayout'
import { RoleGuard } from '@/components/RoleGuard'
import { Landing } from '@/pages/Landing'
import { Login } from '@/pages/auth/Login'
import { Signup } from '@/pages/auth/Signup'
import { CustomerDashboard } from '@/pages/customer/Dashboard'
import { CustomerProfile } from '@/pages/customer/Profile'
import { CustomerNewRequest } from '@/pages/customer/NewRequest'
import { CustomerRequestList } from '@/pages/customer/RequestList'
import { CustomerRequestDetail } from '@/pages/customer/RequestDetail'
import { CustomerPay } from '@/pages/customer/Pay'
import { CustomerPaymentReturn } from '@/pages/customer/PaymentReturn'
import { DriverDashboard } from '@/pages/driver/Dashboard'
import { DriverOnboard } from '@/pages/driver/Onboard'
import { DriverJobHistory } from '@/pages/driver/JobHistory'
import { DriverJobDetail } from '@/pages/driver/JobDetail'
import { FleetDashboard } from '@/pages/fleet/Dashboard'
import { FleetSignup } from '@/pages/fleet/Signup'
import { FleetDrivers } from '@/pages/fleet/Drivers'
import { FleetJobs } from '@/pages/fleet/Jobs'
import { FleetEarnings } from '@/pages/fleet/Earnings'
import { AdminDashboard } from '@/pages/admin/Dashboard'
import { AdminApprovals } from '@/pages/admin/Approvals'
import { AdminPricing } from '@/pages/admin/Pricing'
import { AdminTransactions } from '@/pages/admin/Transactions'
import { AdminFlagged } from '@/pages/admin/Flagged'
import { AdminDisputes } from '@/pages/admin/Disputes'
import { AdminUsers } from '@/pages/admin/Users'
import { AdminUserDetail } from '@/pages/admin/UserDetail'
import { AdminRegions } from '@/pages/admin/Regions'
import { AccountSecurity } from '@/pages/account/Security'
import { NotFound } from '@/pages/NotFound'

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
  )
}
