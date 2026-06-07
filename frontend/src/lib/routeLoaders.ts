// Shared lazy-import thunks. routes.tsx uses these for React.lazy(); PortalLayout
// uses prefetchRoute() to warm the exact same chunk on nav hover/focus. Kept in a
// leaf module so neither routes.tsx nor PortalLayout import each other.

export const load = {
  CustomerDashboard: () => import('@/pages/customer/Dashboard'),
  CustomerProfile: () => import('@/pages/customer/Profile'),
  CustomerNewRequest: () => import('@/pages/customer/NewRequest'),
  CustomerRequestList: () => import('@/pages/customer/RequestList'),
  CustomerRequestDetail: () => import('@/pages/customer/RequestDetail'),
  CustomerPay: () => import('@/pages/customer/Pay'),
  CustomerPaymentReturn: () => import('@/pages/customer/PaymentReturn'),
  DriverDashboard: () => import('@/pages/driver/Dashboard'),
  DriverOnboard: () => import('@/pages/driver/Onboard'),
  DriverJobHistory: () => import('@/pages/driver/JobHistory'),
  DriverJobDetail: () => import('@/pages/driver/JobDetail'),
  FleetDashboard: () => import('@/pages/fleet/Dashboard'),
  FleetSignup: () => import('@/pages/fleet/Signup'),
  FleetDrivers: () => import('@/pages/fleet/Drivers'),
  FleetJobs: () => import('@/pages/fleet/Jobs'),
  FleetEarnings: () => import('@/pages/fleet/Earnings'),
  AdminDashboard: () => import('@/pages/admin/Dashboard'),
  AdminApprovals: () => import('@/pages/admin/Approvals'),
  AdminPricing: () => import('@/pages/admin/Pricing'),
  AdminTransactions: () => import('@/pages/admin/Transactions'),
  AdminFlagged: () => import('@/pages/admin/Flagged'),
  AdminDisputes: () => import('@/pages/admin/Disputes'),
  AdminUsers: () => import('@/pages/admin/Users'),
  AdminUserDetail: () => import('@/pages/admin/UserDetail'),
  AdminRegions: () => import('@/pages/admin/Regions'),
  AccountSecurity: () => import('@/pages/account/Security'),
} as const

// Map nav destination → loader, so PortalLayout can warm a chunk on hover/focus.
const routeLoaders: Record<string, () => Promise<unknown>> = {
  '/customer': load.CustomerDashboard,
  '/customer/new': load.CustomerNewRequest,
  '/customer/requests': load.CustomerRequestList,
  '/customer/profile': load.CustomerProfile,
  '/driver': load.DriverDashboard,
  '/driver/history': load.DriverJobHistory,
  '/driver/onboard': load.DriverOnboard,
  '/driver/security': load.AccountSecurity,
  '/fleet': load.FleetDashboard,
  '/fleet/drivers': load.FleetDrivers,
  '/fleet/jobs': load.FleetJobs,
  '/fleet/earnings': load.FleetEarnings,
  '/fleet/signup': load.FleetSignup,
  '/fleet/security': load.AccountSecurity,
  '/admin': load.AdminDashboard,
  '/admin/users': load.AdminUsers,
  '/admin/drivers': load.AdminUsers,
  '/admin/approvals': load.AdminApprovals,
  '/admin/pricing': load.AdminPricing,
  '/admin/regions': load.AdminRegions,
  '/admin/transactions': load.AdminTransactions,
  '/admin/flagged': load.AdminFlagged,
  '/admin/disputes': load.AdminDisputes,
  '/admin/security': load.AccountSecurity,
}

const prefetched = new Set<string>()

/** Warm the JS chunk for a route ahead of navigation (called on hover/focus). */
export function prefetchRoute(to: string) {
  if (prefetched.has(to)) return
  const loader = routeLoaders[to]
  if (!loader) return
  prefetched.add(to)
  loader().catch(() => prefetched.delete(to))
}
